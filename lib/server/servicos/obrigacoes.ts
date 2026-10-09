import 'server-only'
import { and, asc, eq, gt, inArray, isNull, lt, lte, notExists, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Paginado } from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import {
  ehRecorrente,
  primeiraOcorrenciaDesde,
  proximaData,
  type DadosCriarObrigacao,
  type DadosCumprir,
  type DadosEditarObrigacao,
  type FiltroObrigacoes,
  type Obrigacao,
} from '@/lib/shared/obrigacoes'
import { formatarData } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { ehAdmin } from '../auth'
import { db, type Executor } from '../db/cliente'
import { padraoBusca, sqlVisivel } from '../db/consultas/contratos'
import { contratos, obrigacoes } from '../db/esquema'
import { erroConflito, erroNaoEncontrado, erroRegraNegocio, erroSemPermissao, erroValidacao } from '../http/erros'
import { podeVer } from '../permissoes'
import { carregar, isoInstante, type Linha as LinhaContrato } from './contratos'

/**
 * Obrigações (docs/BACKEND_IMPLEMENTATION.md §8.8).
 *
 * - Criar/editar: quem pode editar o contrato, aberto.
 * - Cumprir/cancelar: quem vê o contrato -- inclusive encerrado (§7.5), para
 *   fechar o que ficou pendente.
 * - Cumprir uma recorrente gera a próxima, se couber na vigência e o
 *   contrato estiver aberto. Desfazer apaga a gerada, se ninguém mexeu nela.
 *
 * As funções `aoEncerrar`, `aoReabrir`, `aoRenovar`, `aoProrrogar` e
 * `aoReduzirVigencia` rodam DENTRO da transação da operação do contrato.
 */

type Linha = typeof obrigacoes.$inferSelect
const carimbo = (matricula: string | null, nome: string | null) => (matricula ? { matricula, nome: nome ?? matricula } : null)
const carimboDe = (u: UsuarioSessao) => ({ matricula: u.matricula, nome: u.nome })
const diaDe = (data: string) => Number(data.slice(8, 10))

function paraObrigacao(o: Linha, c: Pick<LinhaContrato, 'id' | 'codigo' | 'nome' | 'encerradoEm'>, hoje: string): Obrigacao {
  return {
    id: o.id,
    contrato: { id: c.id, codigo: c.codigo, nome: c.nome, encerrado: c.encerradoEm !== null },
    descricao: o.descricao,
    responsavel: o.responsavel,
    data: o.data,
    recorrencia: o.recorrencia,
    situacao: o.situacao,
    atrasada: o.situacao === 'pendente' && o.data < hoje,
    cumpridaEm: o.cumpridaEm,
    cumpridaPor: carimbo(o.cumpridaPorMatricula, o.cumpridaPorNome),
    observacaoCumprimento: o.observacaoCumprimento,
    canceladaEm: o.canceladaEm ? isoInstante(o.canceladaEm) : null,
    motivoCancelamento: o.motivoCancelamento,
    gerada: o.anteriorId !== null && o.criadoPorMatricula === null,
    criadoPor: carimbo(o.criadoPorMatricula, o.criadoPorNome),
  }
}

/** Obrigação + contrato, com visibilidade (404 se não vê o contrato). */
async function carregarObrigacao(ex: Executor, usuario: UsuarioSessao, id: string, travar = false) {
  const consulta = ex.select({ o: obrigacoes, c: contratos }).from(obrigacoes).innerJoin(contratos, eq(contratos.id, obrigacoes.contratoId)).where(eq(obrigacoes.id, id))
  const [linha] = travar ? await consulta.for('update', { of: obrigacoes }) : await consulta
  if (!linha || !podeVer(usuario, linha.c)) throw erroNaoEncontrado('Obrigação não encontrada.')
  return linha
}

function exigirAberto(c: LinhaContrato) {
  if (c.encerradoEm) throw erroRegraNegocio('Contrato encerrado: só é possível cumprir ou cancelar as obrigações que ficaram pendentes.')
}

// ---------------------------------------------------------------- leitura

export async function listarObrigacoes(
  usuario: UsuarioSessao,
  f: FiltroObrigacoes,
  hoje: string = hojeSP(),
): Promise<Paginado<Obrigacao> & { facetas: { responsaveis: string[] } }> {
  const visivel = sqlVisivel(usuario)
  const filtros: SQL[] = [visivel]
  if (f.situacao !== 'todas') filtros.push(eq(obrigacoes.situacao, f.situacao))
  if (f.atrasadas) filtros.push(eq(obrigacoes.situacao, 'pendente'), lt(obrigacoes.data, hoje))
  if (f.responsavel) filtros.push(eq(obrigacoes.responsavel, f.responsavel))
  if (f.contratoId) filtros.push(eq(obrigacoes.contratoId, f.contratoId))
  // Vigência do CONTRATO (não da obrigação) cruza o intervalo -- a semântica da tela.
  if (f.vigenciaDe) filtros.push(sql`${contratos.dataFim} >= ${f.vigenciaDe}`)
  if (f.vigenciaAte) filtros.push(sql`${contratos.dataInicio} <= ${f.vigenciaAte}`)
  if (f.busca) {
    for (const palavra of f.busca.split(/\s+/).filter(Boolean).slice(0, 8)) {
      filtros.push(sql`lower(f_unaccent(${obrigacoes.descricao} || ' ' || ${contratos.nome} || ' ' || ${contratos.codigo})) like ${padraoBusca(palavra)}`)
    }
  }
  const onde = and(...filtros)

  const [linhas, [{ total }], responsaveis] = await Promise.all([
    db
      .select({ o: obrigacoes, c: contratos })
      .from(obrigacoes)
      .innerJoin(contratos, eq(contratos.id, obrigacoes.contratoId))
      .where(onde)
      .orderBy(asc(obrigacoes.data), asc(contratos.codigo))
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina),
    db.select({ total: sql<number>`count(*)::int` }).from(obrigacoes).innerJoin(contratos, eq(contratos.id, obrigacoes.contratoId)).where(onde),
    db
      .selectDistinct({ r: obrigacoes.responsavel })
      .from(obrigacoes)
      .innerJoin(contratos, eq(contratos.id, obrigacoes.contratoId))
      .where(visivel)
      .orderBy(asc(obrigacoes.responsavel)),
  ])
  return {
    itens: linhas.map((l) => paraObrigacao(l.o, l.c, hoje)),
    total,
    pagina: f.pagina,
    porPagina: f.porPagina,
    facetas: { responsaveis: responsaveis.map((r) => r.r) },
  }
}

export async function obrigacoesDoContrato(usuario: UsuarioSessao, contratoId: string, hoje: string = hojeSP()): Promise<Obrigacao[]> {
  const c = await carregar(db, usuario, contratoId)
  const linhas = await db
    .select()
    .from(obrigacoes)
    .where(eq(obrigacoes.contratoId, c.id))
    // Pendentes por vencimento; depois cumpridas (mais recentes primeiro); canceladas por último.
    .orderBy(
      sql`case ${obrigacoes.situacao} when 'pendente' then 0 when 'cumprida' then 1 else 2 end`,
      sql`case when ${obrigacoes.situacao} = 'pendente' then ${obrigacoes.data} end asc`,
      sql`${obrigacoes.data} desc`,
    )
  return linhas.map((o) => paraObrigacao(o, c, hoje))
}

// ---------------------------------------------------------------- escrita

export async function criarObrigacao(
  usuario: UsuarioSessao,
  contratoId: string,
  dados: DadosCriarObrigacao,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<{ obrigacao: Obrigacao; avisos: string[] }> {
  return db.transaction(async (tx) => {
    const c = await carregar(tx, usuario, contratoId, true)
    exigirAberto(c)
    const quem = carimboDe(usuario)
    const [o] = await tx
      .insert(obrigacoes)
      .values({
        contratoId: c.id,
        descricao: dados.descricao,
        responsavel: dados.responsavel,
        data: dados.data,
        recorrencia: dados.recorrencia,
        diaAncora: ehRecorrente(dados.recorrencia) ? diaDe(dados.data) : null,
        criadoPorMatricula: quem.matricula,
        criadoPorNome: quem.nome,
      })
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'obrigacao',
        acao: 'obrigacao.criada',
        descricao: `Registrou a obrigação “${o.descricao}” (${o.recorrencia}, ${formatarData(o.data)}, ${o.responsavel})`,
        contratoId: c.id,
        dados: { obrigacaoId: o.id },
      },
      contexto,
    )
    const avisos = dados.data < c.dataInicio || dados.data > c.dataFim ? ['Data fora da vigência do contrato.'] : []
    return { obrigacao: paraObrigacao(o, c, hoje), avisos }
  })
}

const ROTULOS: Record<string, string> = { descricao: 'descrição', responsavel: 'responsável', data: 'data', recorrencia: 'recorrência' }

export async function editarObrigacao(
  usuario: UsuarioSessao,
  id: string,
  dados: DadosEditarObrigacao,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<Obrigacao> {
  return db.transaction(async (tx) => {
    const { o, c } = await carregarObrigacao(tx, usuario, id, true)
    exigirAberto(c)
    if (o.situacao !== 'pendente') throw erroRegraNegocio('Só obrigações pendentes podem ser editadas.')

    const mudancas = Object.fromEntries(Object.entries(dados).filter(([k, v]) => v !== undefined && v !== o[k as keyof Linha])) as DadosEditarObrigacao
    if (!Object.keys(mudancas).length) return paraObrigacao(o, c, hoje)

    const data = mudancas.data ?? o.data
    const rec = mudancas.recorrencia ?? o.recorrencia
    const diaAncora = mudancas.data !== undefined || mudancas.recorrencia !== undefined ? (ehRecorrente(rec) ? diaDe(data) : null) : o.diaAncora

    const [editada] = await tx
      .update(obrigacoes)
      .set({ ...mudancas, diaAncora, editadaEm: new Date().toISOString() })
      .where(eq(obrigacoes.id, o.id))
      .returning()
    const partes = Object.entries(mudancas).map(([k, v]) => {
      const de = o[k as keyof Linha] as string
      return k === 'data' ? `${ROTULOS[k]}: ${formatarData(de)} → ${formatarData(v as string)}` : `${ROTULOS[k]}: ${de} → ${v}`
    })
    await registrarAuditoria(
      tx,
      {
        usuario: carimboDe(usuario),
        categoria: 'obrigacao',
        acao: 'obrigacao.editada',
        descricao: `Alterou a obrigação “${o.descricao}”: ${partes.join('; ')}`,
        contratoId: c.id,
        dados: { obrigacaoId: o.id, ...Object.fromEntries(Object.entries(mudancas).map(([k, v]) => [k, { de: o[k as keyof Linha], para: v }])) },
      },
      contexto,
    )
    return paraObrigacao(editada, c, hoje)
  })
}

/** Gera a próxima ocorrência de `o`, se couber na vigência do contrato aberto. */
async function gerarProxima(tx: Executor, o: Linha, c: Pick<LinhaContrato, 'dataFim' | 'encerradoEm'>): Promise<Linha | null> {
  if (c.encerradoEm || !ehRecorrente(o.recorrencia)) return null
  const proxima = proximaData(o.data, o.recorrencia, o.diaAncora)
  if (!proxima || proxima > c.dataFim) return null
  const [nova] = await tx
    .insert(obrigacoes)
    .values({
      contratoId: o.contratoId,
      descricao: o.descricao,
      responsavel: o.responsavel,
      data: proxima,
      recorrencia: o.recorrencia,
      diaAncora: o.diaAncora,
      anteriorId: o.id,
    })
    .returning()
  return nova
}

export async function cumprirObrigacao(
  usuario: UsuarioSessao,
  id: string,
  dados: DadosCumprir,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<{ obrigacao: Obrigacao; proxima: Obrigacao | null }> {
  return db.transaction(async (tx) => {
    const { o, c } = await carregarObrigacao(tx, usuario, id, true)
    if (o.situacao !== 'pendente') throw erroConflito('Esta obrigação não está mais pendente.')
    const cumpridaEm = dados.cumpridaEm ?? hoje
    if (cumpridaEm > hoje) throw erroValidacao({ cumpridaEm: 'A data de cumprimento não pode ser futura.' })

    const quem = carimboDe(usuario)
    const [cumprida] = await tx
      .update(obrigacoes)
      .set({ situacao: 'cumprida', cumpridaEm, cumpridaPorMatricula: quem.matricula, cumpridaPorNome: quem.nome, observacaoCumprimento: dados.observacao ?? null })
      .where(eq(obrigacoes.id, o.id))
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'obrigacao',
        acao: 'obrigacao.cumprida',
        descricao: `Marcou como cumprida “${o.descricao}” (vencimento ${formatarData(o.data)})`,
        contratoId: c.id,
        dados: { obrigacaoId: o.id, cumpridaEm },
      },
      contexto,
    )

    const proxima = await gerarProxima(tx, cumprida, c)
    if (proxima) {
      await registrarAuditoria(tx, {
        usuario: null,
        categoria: 'obrigacao',
        acao: 'obrigacao.gerada',
        descricao: `Gerou a próxima ocorrência de “${o.descricao}” para ${formatarData(proxima.data)}`,
        contratoId: c.id,
        dados: { obrigacaoId: proxima.id, anteriorId: o.id },
      })
    }
    return { obrigacao: paraObrigacao(cumprida, c, hoje), proxima: proxima ? paraObrigacao(proxima, c, hoje) : null }
  })
}

export async function desfazerCumprimento(usuario: UsuarioSessao, id: string, contexto: ContextoAuditoria, hoje: string = hojeSP()): Promise<Obrigacao> {
  return db.transaction(async (tx) => {
    const { o, c } = await carregarObrigacao(tx, usuario, id, true)
    if (o.situacao !== 'cumprida') throw erroRegraNegocio('Esta obrigação não está marcada como cumprida.')
    if (!ehAdmin(usuario) && o.cumpridaPorMatricula !== usuario.matricula) {
      throw erroSemPermissao('Só quem marcou como cumprida (ou um administrador) pode desfazer.')
    }

    const geradas = await tx.select().from(obrigacoes).where(eq(obrigacoes.anteriorId, o.id)).for('update')
    for (const g of geradas) {
      if (g.situacao !== 'pendente' || g.editadaEm !== null || g.criadoPorMatricula !== null) {
        throw erroRegraNegocio('A próxima ocorrência já foi cumprida, cancelada ou editada; desfaça-a primeiro.')
      }
    }
    // A gerada nunca existiu do ponto de vista do negócio: some. A auditoria guarda o rastro.
    if (geradas.length) await tx.delete(obrigacoes).where(inArray(obrigacoes.id, geradas.map((g) => g.id)))

    const [desfeita] = await tx
      .update(obrigacoes)
      .set({ situacao: 'pendente', cumpridaEm: null, cumpridaPorMatricula: null, cumpridaPorNome: null, observacaoCumprimento: null })
      .where(eq(obrigacoes.id, o.id))
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: carimboDe(usuario),
        categoria: 'obrigacao',
        acao: 'obrigacao.cumprimento_desfeito',
        descricao: `Desfez o cumprimento de “${o.descricao}” (vencimento ${formatarData(o.data)})`,
        contratoId: c.id,
        dados: { obrigacaoId: o.id, cumpridaEm: o.cumpridaEm, geradasApagadas: geradas.map((g) => ({ id: g.id, data: g.data })) },
      },
      contexto,
    )
    return paraObrigacao(desfeita, c, hoje)
  })
}

export async function cancelarObrigacao(usuario: UsuarioSessao, id: string, motivo: string, contexto: ContextoAuditoria, hoje: string = hojeSP()): Promise<Obrigacao> {
  return db.transaction(async (tx) => {
    const { o, c } = await carregarObrigacao(tx, usuario, id, true)
    if (o.situacao !== 'pendente') throw erroRegraNegocio('Só obrigações pendentes podem ser canceladas.')
    const [cancelada] = await tx
      .update(obrigacoes)
      .set({ situacao: 'cancelada', canceladaEm: new Date().toISOString(), motivoCancelamento: motivo, origemCancelamento: 'manual' })
      .where(eq(obrigacoes.id, o.id))
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: carimboDe(usuario),
        categoria: 'obrigacao',
        acao: 'obrigacao.cancelada',
        descricao: `Cancelou a obrigação “${o.descricao}” (${formatarData(o.data)}) — ${motivo}`,
        contratoId: c.id,
        dados: { obrigacaoId: o.id, motivo },
      },
      contexto,
    )
    return paraObrigacao(cancelada, c, hoje)
  })
}

// ---------------------------------------------------------------- ganchos das operações do contrato

/** Registra um resumo do que um gancho fez (uma linha por operação, não uma por obrigação). */
async function auditarLote(tx: Executor, usuario: UsuarioSessao | null, contratoId: string, acao: string, descricao: string, ids: string[], contexto?: ContextoAuditoria) {
  if (!ids.length) return
  await registrarAuditoria(tx, { usuario: usuario ? carimboDe(usuario) : null, categoria: 'obrigacao', acao, descricao, contratoId, dados: { obrigacoes: ids } }, contexto)
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

/** Encerrar: pendentes com vencimento DEPOIS do encerramento são canceladas; as atrasadas ficam (alguém ainda deve). */
export async function aoEncerrar(tx: Executor, contratoId: string, dataEncerramento: string, usuario: UsuarioSessao, contexto: ContextoAuditoria) {
  const canceladas = await tx
    .update(obrigacoes)
    .set({ situacao: 'cancelada', canceladaEm: new Date().toISOString(), motivoCancelamento: 'Contrato encerrado', origemCancelamento: 'encerramento' })
    .where(and(eq(obrigacoes.contratoId, contratoId), eq(obrigacoes.situacao, 'pendente'), gt(obrigacoes.data, dataEncerramento)))
    .returning({ id: obrigacoes.id })
  await auditarLote(tx, usuario, contratoId, 'obrigacao.canceladas_no_encerramento', `Cancelou ${plural(canceladas.length, 'obrigação futura', 'obrigações futuras')} pelo encerramento`, canceladas.map((r) => r.id), contexto)
}

/** Reabrir: devolve a pendente exatamente as que o encerramento cancelou. */
export async function aoReabrir(tx: Executor, contratoId: string, usuario: UsuarioSessao, contexto: ContextoAuditoria) {
  const restauradas = await tx
    .update(obrigacoes)
    .set({ situacao: 'pendente', canceladaEm: null, motivoCancelamento: null, origemCancelamento: null })
    .where(and(eq(obrigacoes.contratoId, contratoId), eq(obrigacoes.situacao, 'cancelada'), eq(obrigacoes.origemCancelamento, 'encerramento')))
    .returning({ id: obrigacoes.id })
  await auditarLote(tx, usuario, contratoId, 'obrigacao.restauradas_na_reabertura', `Devolveu a pendente ${plural(restauradas.length, 'obrigação cancelada', 'obrigações canceladas')} pelo encerramento`, restauradas.map((r) => r.id), contexto)
}

/**
 * Renovar: séries recorrentes pendentes passam para o contrato novo (canceladas
 * no antigo, recriadas no novo a partir do novo início). Única/Por evento ficam.
 */
export async function aoRenovar(
  tx: Executor,
  antigo: Pick<LinhaContrato, 'id' | 'codigo'>,
  novo: Pick<LinhaContrato, 'id' | 'codigo' | 'dataInicio' | 'dataFim'>,
  usuario: UsuarioSessao,
  contexto: ContextoAuditoria,
) {
  const pendentes = await tx
    .select()
    .from(obrigacoes)
    .where(and(eq(obrigacoes.contratoId, antigo.id), eq(obrigacoes.situacao, 'pendente'), inArray(obrigacoes.recorrencia, ['Mensal', 'Anual'])))
  if (!pendentes.length) return
  await tx
    .update(obrigacoes)
    .set({ situacao: 'cancelada', canceladaEm: new Date().toISOString(), motivoCancelamento: `Transferida para ${novo.codigo}`, origemCancelamento: 'renovacao' })
    .where(inArray(obrigacoes.id, pendentes.map((p) => p.id)))

  const quem = carimboDe(usuario)
  const criadas: string[] = []
  for (const p of pendentes) {
    const data = primeiraOcorrenciaDesde(p.data, p.recorrencia, p.diaAncora, novo.dataInicio)
    if (data > novo.dataFim) continue
    const [nova] = await tx
      .insert(obrigacoes)
      .values({ contratoId: novo.id, descricao: p.descricao, responsavel: p.responsavel, data, recorrencia: p.recorrencia, diaAncora: p.diaAncora, criadoPorMatricula: quem.matricula, criadoPorNome: quem.nome })
      .returning({ id: obrigacoes.id })
    criadas.push(nova.id)
  }
  await auditarLote(tx, usuario, antigo.id, 'obrigacao.transferidas', `Transferiu ${plural(pendentes.length, 'obrigação recorrente', 'obrigações recorrentes')} para ${novo.codigo}`, pendentes.map((p) => p.id), contexto)
  await auditarLote(tx, usuario, novo.id, 'obrigacao.recebidas', `Recebeu ${plural(criadas.length, 'obrigação recorrente', 'obrigações recorrentes')} de ${antigo.codigo}`, criadas, contexto)
}

/**
 * Vigência estendida (aditivo, ou anulação de um aditivo que tinha encurtado):
 * 1. devolve a pendente as ocorrências que uma redução anterior cancelou e
 *    que voltaram a caber;
 * 2. retoma séries que pararam porque a próxima ocorrência passava do
 *    término antigo (última cumprida, sem sucessora).
 */
export async function aoProrrogar(tx: Executor, contrato: Pick<LinhaContrato, 'id' | 'dataFim' | 'encerradoEm'>, contexto: ContextoAuditoria) {
  const restauradas = await tx
    .update(obrigacoes)
    .set({ situacao: 'pendente', canceladaEm: null, motivoCancelamento: null, origemCancelamento: null })
    .where(
      and(
        eq(obrigacoes.contratoId, contrato.id),
        eq(obrigacoes.situacao, 'cancelada'),
        eq(obrigacoes.origemCancelamento, 'reducao_vigencia'),
        lte(obrigacoes.data, contrato.dataFim),
      ),
    )
    .returning({ id: obrigacoes.id })
  await auditarLote(tx, null, contrato.id, 'obrigacao.restauradas_na_prorrogacao', `Devolveu a pendente ${plural(restauradas.length, 'ocorrência', 'ocorrências')} que voltaram a caber na vigência`, restauradas.map((r) => r.id), contexto)

  const filha = alias(obrigacoes, 'filha')
  const pontas = await tx
    .select()
    .from(obrigacoes)
    .where(
      and(
        eq(obrigacoes.contratoId, contrato.id),
        eq(obrigacoes.situacao, 'cumprida'),
        inArray(obrigacoes.recorrencia, ['Mensal', 'Anual']),
        notExists(tx.select({ x: sql`1` }).from(filha).where(eq(filha.anteriorId, obrigacoes.id))),
      ),
    )
  const geradas: string[] = []
  for (const p of pontas) {
    const nova = await gerarProxima(tx, p, contrato)
    if (nova) geradas.push(nova.id)
  }
  await auditarLote(tx, null, contrato.id, 'obrigacao.retomadas', `Retomou ${plural(geradas.length, 'série recorrente', 'séries recorrentes')} com a nova vigência`, geradas, contexto)
}

/**
 * Vigência encurtada (aditivo que reduz o término, ou anulação de aditivo):
 * cancela as ocorrências GERADAS pelo sistema e intocadas que ficaram depois do
 * novo término. As criadas ou editadas à mão ficam -- alguém as quis ali.
 */
export async function aoReduzirVigencia(
  tx: Executor,
  contrato: Pick<LinhaContrato, 'id' | 'dataFim'>,
  motivo: string,
  usuario: UsuarioSessao,
  contexto: ContextoAuditoria,
) {
  const canceladas = await tx
    .update(obrigacoes)
    .set({ situacao: 'cancelada', canceladaEm: new Date().toISOString(), motivoCancelamento: motivo, origemCancelamento: 'reducao_vigencia' })
    .where(
      and(
        eq(obrigacoes.contratoId, contrato.id),
        eq(obrigacoes.situacao, 'pendente'),
        gt(obrigacoes.data, contrato.dataFim),
        isNull(obrigacoes.criadoPorMatricula),
        isNull(obrigacoes.editadaEm),
      ),
    )
    .returning({ id: obrigacoes.id })
  await auditarLote(tx, usuario, contrato.id, 'obrigacao.canceladas_por_reducao', `Cancelou ${plural(canceladas.length, 'ocorrência gerada', 'ocorrências geradas')} além do novo término — ${motivo}`, canceladas.map((r) => r.id), contexto)
}
