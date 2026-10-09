import 'server-only'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { descreverItem, maisUrgente, planejarAlertas, type ItemAlerta, type TipoAlerta } from '@/lib/shared/alertas'
import { hojeSP } from '@/lib/shared/datas'
import { formatarDocumento } from '@/lib/shared/documentoFiscal'
import { formatarData } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { registrarAuditoria } from '../auditoria'
import { configEmail } from '../config'
import { db, sqlCru } from '../db/cliente'
import { alertasEnviados, contratos } from '../db/esquema'
import { enviarEmail, html, type Email } from '../email'
import { log } from '../log'
import { carregar, isoInstante } from './contratos'

/**
 * Job diário de alertas por e-mail (docs/BACKEND_IMPLEMENTATION.md §9.1).
 *
 * - Um e-mail por contrato por execução, com tudo o que disparou para ele
 *   (decisão do M6); cada limiar fica registrado à parte, para nunca repetir.
 * - Destinatários: os e-mails digitados de gestor e responsável jurídico (D6),
 *   sem repetição. Em contrato restrito, são exatamente quem pode vê-lo.
 * - Falha de envio vira `falhou` e é tentada de novo nas próximas execuções,
 *   até 3 vezes; depois desiste (fica visível no histórico do contrato).
 * - Trava no banco (advisory lock): duas execuções nunca rodam juntas
 *   (worker + botão do admin, ou duas instâncias).
 */

const CHAVE_TRAVA = 7_401_001
const MAX_FALHAS = 3

type Contrato = typeof contratos.$inferSelect

export interface ResultadoAlertas {
  hoje: string
  simulacao: boolean
  /** Outra execução já estava rodando: esta não fez nada. */
  emAndamento: boolean
  modo: 'smtp' | 'arquivo'
  enviados: { contratoId: string; codigo: string; nome: string; para: string[]; itens: string[] }[]
  ignorados: number
  falhas: { contratoId: string; codigo: string; erro: string }[]
  desistidos: { contratoId: string; codigo: string; itens: string[] }[]
}

function chave(i: { tipo: string; limiarDias: number; dataReferencia: string }) {
  return `${i.tipo}|${i.limiarDias}|${i.dataReferencia}`
}

export function montarEmail(c: Contrato, itens: ItemAlerta[], para: string[]): Email {
  const { appUrl } = configEmail()
  const link = `${appUrl}/contratos/${c.id}`
  const frases = itens.map(descreverItem)
  const assunto = `[Contratos] ${c.codigo} ${c.nome} — ${descreverItem(maisUrgente(itens))}`
  const limiteAviso = itens.find((i) => i.tipo === 'prazo_aviso')?.dataReferencia
  const linhas: [string, string][] = [
    ['Contrato', `${c.codigo} — ${c.nome}`],
    ['Fornecedor', `${c.fornecedorNome} (${formatarDocumento(c.fornecedorDocumento)})`],
    ['Vigência', `${formatarData(c.dataInicio)} a ${formatarData(c.dataFim)}`],
    ...(limiteAviso ? ([['Prazo-limite de aviso', formatarData(limiteAviso)]] as [string, string][]) : []),
    ['Gestor', c.gestorNome],
    ['Responsável jurídico', c.responsavelJuridicoNome],
    ...(c.acaoVencimento ? ([['Ação para o vencimento', `${c.acaoVencimento} · ${c.statusAcao} · prazo ${formatarData(c.prazoAcao!)}`]] as [string, string][]) : []),
  ]
  const avisoRenovacao = c.renovacaoAutomatica
    ? 'Renovação automática: o sistema NÃO registra a renovação sozinho. Registre a renovação ou o encerramento no contrato.'
    : null

  const texto = [
    `Atenção: ${frases.join('; ')}.`,
    '',
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    ...(avisoRenovacao ? ['', avisoRenovacao] : []),
    '',
    `Abrir o contrato: ${link}`,
    '',
    `Enviado para ${para.join(', ')} pelo sistema Contratos Jurídicos.`,
  ].join('\n')

  const corpo = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#14202e">
<p style="font-size:15px"><strong>Atenção:</strong> ${html(frases.join('; '))}.</p>
<table style="border-collapse:collapse">${linhas
    .map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#5c6b7f">${html(k)}</td><td style="padding:3px 0">${html(v)}</td></tr>`)
    .join('')}</table>
${avisoRenovacao ? `<p style="color:#b45309">${html(avisoRenovacao)}</p>` : ''}
<p><a href="${html(link)}" style="background:#0a7c2a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Abrir o contrato</a></p>
<p style="font-size:12px;color:#5c6b7f">Enviado para ${html(para.join(', '))} pelo sistema Contratos Jurídicos.</p>
</body></html>`

  return { para, assunto, texto, html: corpo }
}

function destinatarios(c: Contrato): string[] {
  return [...new Set([c.gestorEmail, c.responsavelJuridicoEmail].map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

export async function executarAlertas(opcoes: { hoje?: string; simular?: boolean } = {}): Promise<ResultadoAlertas> {
  const hoje = opcoes.hoje ?? hojeSP()
  const simulacao = opcoes.simular === true
  const resultado: ResultadoAlertas = {
    hoje,
    simulacao,
    emAndamento: false,
    modo: configEmail().smtp ? 'smtp' : 'arquivo',
    enviados: [],
    ignorados: 0,
    falhas: [],
    desistidos: [],
  }

  const conexao = await sqlCru().reserve()
  try {
    const [{ travou }] = await conexao`select pg_try_advisory_lock(${CHAVE_TRAVA}) as travou`
    if (!travou) return { ...resultado, emAndamento: true }
    try {
      await processar(hoje, simulacao, resultado)
    } finally {
      await conexao`select pg_advisory_unlock(${CHAVE_TRAVA})`
    }
  } finally {
    conexao.release()
  }

  log.info(
    { hoje, simulacao, enviados: resultado.enviados.length, ignorados: resultado.ignorados, falhas: resultado.falhas.length, desistidos: resultado.desistidos.length },
    'alertas: execução concluída',
  )
  return resultado
}

async function processar(hoje: string, simulacao: boolean, resultado: ResultadoAlertas) {
  const abertos = await db.select().from(contratos).where(isNull(contratos.encerradoEm))
  if (!abertos.length) return
  const ids = abertos.map((c) => c.id)
  const registros = await db.select().from(alertasEnviados).where(inArray(alertasEnviados.contratoId, ids))

  for (const c of abertos) {
    const doContrato = registros.filter((r) => r.contratoId === c.id)
    const processados = doContrato.filter((r) => r.situacao !== 'falhou')
    const plano = planejarAlertas(c, processados, hoje)

    const falhasPorChave = new Map<string, number>()
    for (const r of doContrato.filter((r) => r.situacao === 'falhou')) falhasPorChave.set(chave(r), (falhasPorChave.get(chave(r)) ?? 0) + 1)
    const desistidos = plano.enviar.filter((i) => (falhasPorChave.get(chave(i)) ?? 0) >= MAX_FALHAS)
    const enviar = plano.enviar.filter((i) => !desistidos.includes(i))
    if (desistidos.length) resultado.desistidos.push({ contratoId: c.id, codigo: c.codigo, itens: desistidos.map(descreverItem) })

    resultado.ignorados += plano.ignorar.length
    const para = destinatarios(c)
    if (!enviar.length) {
      if (!simulacao) await registrar(c.id, plano.ignorar, 'ignorado', [])
      continue
    }

    if (simulacao) {
      resultado.enviados.push({ contratoId: c.id, codigo: c.codigo, nome: c.nome, para, itens: enviar.map(descreverItem) })
      continue
    }

    try {
      await enviarEmail(montarEmail(c, enviar, para))
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      log.error({ err: erro, contratoId: c.id }, 'alertas: falha no envio')
      await registrar(c.id, enviar, 'falhou', para, mensagem)
      resultado.falhas.push({ contratoId: c.id, codigo: c.codigo, erro: mensagem })
      continue
    }

    await db.transaction(async (tx) => {
      await registrar(c.id, plano.ignorar, 'ignorado', [], undefined, tx)
      await registrar(c.id, enviar, 'enviado', para, undefined, tx)
      await registrarAuditoria(tx, {
        usuario: null,
        categoria: 'contrato',
        acao: 'alerta.enviado',
        descricao: `Disparou alerta por e-mail (${enviar.map(descreverItem).join('; ')}) para ${para.join(', ')}`,
        contratoId: c.id,
        dados: { itens: enviar, para },
      })
    })
    resultado.enviados.push({ contratoId: c.id, codigo: c.codigo, nome: c.nome, para, itens: enviar.map(descreverItem) })
  }
}

async function registrar(
  contratoId: string,
  itens: ItemAlerta[],
  situacao: 'enviado' | 'ignorado' | 'falhou',
  para: string[],
  erro?: string,
  ex: Pick<typeof db, 'insert'> = db,
) {
  if (!itens.length) return
  await ex
    .insert(alertasEnviados)
    .values(itens.map((i) => ({ contratoId, tipo: i.tipo, limiarDias: i.limiarDias, dataReferencia: i.dataReferencia, situacao, destinatarios: para, erro: erro ?? null })))
    .onConflictDoNothing()
}

// ---------------------------------------------------------------- leitura

export interface AlertaEnviado {
  id: string
  tipo: TipoAlerta
  limiarDias: number
  dataReferencia: string
  situacao: 'enviado' | 'ignorado' | 'falhou'
  destinatarios: string[]
  erro: string | null
  enviadoEm: string
}

/** GET /contratos/{id}/alertas-enviados -- histórico de e-mails do contrato (sem os `ignorado`). */
export async function alertasDoContrato(usuario: UsuarioSessao, contratoId: string): Promise<AlertaEnviado[]> {
  await carregar(db, usuario, contratoId)
  const linhas = await db
    .select()
    .from(alertasEnviados)
    .where(and(eq(alertasEnviados.contratoId, contratoId), sql`${alertasEnviados.situacao} <> 'ignorado'`))
    .orderBy(desc(alertasEnviados.enviadoEm))
  return linhas.map((l) => ({ ...l, enviadoEm: isoInstante(l.enviadoEm) }))
}

/** Último e-mail enviado por contrato (para a fila de Alertas). */
export async function ultimosEnviados(contratoIds: string[]): Promise<Map<string, { tipo: TipoAlerta; limiarDias: number; enviadoEm: string }>> {
  if (!contratoIds.length) return new Map()
  const linhas = await db
    .selectDistinctOn([alertasEnviados.contratoId], {
      contratoId: alertasEnviados.contratoId,
      tipo: alertasEnviados.tipo,
      limiarDias: alertasEnviados.limiarDias,
      enviadoEm: alertasEnviados.enviadoEm,
    })
    .from(alertasEnviados)
    .where(and(inArray(alertasEnviados.contratoId, contratoIds), eq(alertasEnviados.situacao, 'enviado')))
    .orderBy(alertasEnviados.contratoId, desc(alertasEnviados.enviadoEm))
  return new Map(linhas.map((l) => [l.contratoId, { tipo: l.tipo, limiarDias: l.limiarDias, enviadoEm: isoInstante(l.enviadoEm) }]))
}
