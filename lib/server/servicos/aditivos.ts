import 'server-only'
import { and, desc, eq, isNull, max, sql } from 'drizzle-orm'
import type { ContratoDetalhe, DadosAditivo, DadosAnularAditivo, DadosRenovar } from '@/lib/shared/contratos'
import { esquemaCriarContrato } from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import { formatarDocumento } from '@/lib/shared/documentoFiscal'
import { formatarData, formatarMoeda } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { comGravacao } from '../armazenamento'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { exigirAdmin } from '../auth'
import { db, type Executor } from '../db/cliente'
import { contratos, contratoVigencias } from '../db/esquema'
import { ErroApi, erroConflito, erroRegraNegocio, erroValidacao } from '../http/erros'
import type { ArquivoValidado } from '../http/upload'
import { carregar, inserirContrato, montarDetalhe, type Linha } from './contratos'
import { inserirDocumento } from './documentos'

/**
 * Aditivos, anulacao de aditivo e renovacao (docs/BACKEND_IMPLEMENTATION.md
 * §8.5–8.6, D7, D9).
 *
 * Invariante (§6.4): `contratos.dataFim` e `contratos.valorMensal` sao sempre
 * os da ULTIMA vigencia valida (nao anulada). Toda operacao aqui grava a
 * vigencia e o contrato na mesma transacao, com o contrato travado.
 *
 * Obrigacoes (transferir na renovacao, retomar recorrencia apos aditivo)
 * entram no M5, quando a tabela existir.
 */

const carimboDe = (u: UsuarioSessao) => ({ matricula: u.matricula, nome: u.nome })
const dinheiroDb = (v: number) => v.toFixed(2)
const nn = (n: number) => String(n).padStart(2, '0')

function exigirAberto(c: Linha, acao: string) {
  if (c.encerradoEm) throw erroRegraNegocio(`Contrato encerrado: não é possível ${acao}.`)
}

function exigirVersao(c: Linha, versao: number) {
  if (c.versao !== versao) throw erroConflito('Este contrato foi alterado por outra pessoa. Recarregue a página e tente de novo.')
}

/** Vigencias validas (nao anuladas), da mais recente para a mais antiga. */
async function vigenciasValidas(ex: Executor, contratoId: string) {
  return ex
    .select()
    .from(contratoVigencias)
    .where(and(eq(contratoVigencias.contratoId, contratoId), isNull(contratoVigencias.anuladoEm)))
    .orderBy(desc(contratoVigencias.criadoEm), sql`${contratoVigencias.numero} desc nulls last`)
}

// ---------------------------------------------------------------- aditivo

export async function registrarAditivo(
  usuario: UsuarioSessao,
  contratoId: string,
  dados: DadosAditivo,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
  arquivo?: ArquivoValidado,
): Promise<ContratoDetalhe> {
  return comGravacao((gravacao) =>
    db.transaction(async (tx) => {
      const c = await carregar(tx, usuario, contratoId, true)
      exigirAberto(c, 'registrar aditivo')
      exigirVersao(c, dados.versao)

      if (dados.dataInicio < c.dataInicio) {
        throw erroValidacao({ dataInicio: `O aditivo não pode começar antes do início do contrato (${formatarData(c.dataInicio)}).` })
      }
      const valorAtual = Number(c.valorMensal)
      if (dados.dataFim === c.dataFim && Math.abs(dados.valorMensal - valorAtual) < 0.005) {
        throw erroRegraNegocio('O aditivo não altera a vigência nem o valor mensal.')
      }
      // Encurtar ate deixar o contrato vencido na hora: so com confirmacao explicita
      // (um erro de digitacao nao pode expirar um contrato em silencio).
      if (dados.dataFim < hoje && !dados.confirmarEncurtamento) {
        throw new ErroApi(
          'REGRA_NEGOCIO',
          `Com término em ${formatarData(dados.dataFim)}, o contrato fica vencido imediatamente. Confirme se é isso mesmo.`,
          { detalhes: { confirmar: 'confirmarEncurtamento' } },
        )
      }

      // Numero do aditivo: maior ja usado + 1 (anulados contam: numero nunca se repete).
      const [{ ultimo }] = await tx
        .select({ ultimo: max(contratoVigencias.numero) })
        .from(contratoVigencias)
        .where(and(eq(contratoVigencias.contratoId, c.id), eq(contratoVigencias.tipo, 'Aditivo')))
      const numero = (ultimo ?? 0) + 1

      let documentoId: string | null = null
      if (arquivo) {
        const doc = await inserirDocumento(tx, gravacao, usuario, c.id, { arquivo, tipo: 'Aditivo', nome: `Aditivo ${nn(numero)} - ${arquivo.nomeArquivo}` }, contexto)
        documentoId = doc.id
      }

      const quem = carimboDe(usuario)
      await tx.insert(contratoVigencias).values({
        contratoId: c.id,
        tipo: 'Aditivo',
        numero,
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim,
        valorMensal: dinheiroDb(dados.valorMensal),
        observacao: dados.observacao ?? null,
        documentoId,
        criadoPorMatricula: quem.matricula,
        criadoPorNome: quem.nome,
      })
      const [atualizado] = await tx
        .update(contratos)
        .set({ dataFim: dados.dataFim, valorMensal: dinheiroDb(dados.valorMensal), versao: c.versao + 1, atualizadoEm: new Date().toISOString() })
        .where(eq(contratos.id, c.id))
        .returning()

      const partes = [
        dados.dataFim !== c.dataFim ? `vigência ${formatarData(c.dataFim)} → ${formatarData(dados.dataFim)}` : null,
        Math.abs(dados.valorMensal - valorAtual) >= 0.005 ? `valor ${formatarMoeda(valorAtual)} → ${formatarMoeda(dados.valorMensal)}` : null,
      ].filter(Boolean)
      await registrarAuditoria(
        tx,
        {
          usuario: quem,
          categoria: 'contrato',
          acao: 'aditivo.registrado',
          descricao: `Registrou o Aditivo ${nn(numero)}: ${partes.join('; ')}`,
          contratoId: c.id,
          dados: {
            numero,
            dataFim: { de: c.dataFim, para: dados.dataFim },
            valorMensal: { de: valorAtual, para: dados.valorMensal },
            documentoId,
          },
        },
        contexto,
      )
      return montarDetalhe(tx, usuario, atualizado, hoje)
    }),
  )
}

// ---------------------------------------------------------------- anular aditivo

export async function anularAditivo(
  usuario: UsuarioSessao,
  contratoId: string,
  aditivoId: string,
  dados: DadosAnularAditivo,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<ContratoDetalhe> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const c = await carregar(tx, usuario, contratoId, true)
    exigirAberto(c, 'anular aditivo')
    exigirVersao(c, dados.versao)

    const [ultimo, anterior] = await vigenciasValidas(tx, c.id)
    if (!ultimo || ultimo.id !== aditivoId || ultimo.tipo !== 'Aditivo') {
      throw erroRegraNegocio('Só o aditivo mais recente (ainda válido) pode ser anulado.')
    }
    // Sempre ha uma anterior: a Original/Renovação nunca e anulada.
    const quem = carimboDe(usuario)
    await tx
      .update(contratoVigencias)
      .set({ anuladoEm: new Date().toISOString(), anuladoPorMatricula: quem.matricula, anuladoPorNome: quem.nome, justificativaAnulacao: dados.justificativa })
      .where(eq(contratoVigencias.id, ultimo.id))
    const [atualizado] = await tx
      .update(contratos)
      .set({ dataFim: anterior.dataFim, valorMensal: anterior.valorMensal, versao: c.versao + 1, atualizadoEm: new Date().toISOString() })
      .where(eq(contratos.id, c.id))
      .returning()

    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'contrato',
        acao: 'aditivo.anulado',
        descricao: `Anulou o Aditivo ${nn(ultimo.numero ?? 0)} — ${dados.justificativa}. Vigência volta a ${formatarData(anterior.dataFim)}, valor ${formatarMoeda(Number(anterior.valorMensal))}`,
        contratoId: c.id,
        dados: { aditivoId: ultimo.id, numero: ultimo.numero, justificativa: dados.justificativa },
      },
      contexto,
    )
    return montarDetalhe(tx, usuario, atualizado, hoje)
  })
}

// ---------------------------------------------------------------- renovar

/** Dados do contrato antigo no formato do cadastro, para servir de base a renovacao. */
function baseDoAntigo(c: Linha) {
  return {
    nome: c.nome,
    categoriaId: c.categoriaId,
    segmentoId: c.segmentoId,
    empresaId: c.empresaId,
    filialId: c.filialId,
    areaResponsavelId: c.areaResponsavelId,
    centroCustoId: c.centroCustoId,
    fornecedorNome: c.fornecedorNome,
    fornecedorDocumento: formatarDocumento(c.fornecedorDocumento),
    fornecedorContato: c.fornecedorContato,
    objeto: c.objeto,
    observacoes: c.observacoes,
    gestorNome: c.gestorNome,
    gestorEmail: c.gestorEmail,
    responsavelJuridicoNome: c.responsavelJuridicoNome,
    responsavelJuridicoEmail: c.responsavelJuridicoEmail,
    acessoRestrito: c.acessoRestrito,
    renovacaoAutomatica: c.renovacaoAutomatica,
    prazoAvisoCancelamentoDias: c.prazoAvisoCancelamentoDias,
    formaPagamento: c.formaPagamento,
    indiceReajuste: c.indiceReajuste,
    dataBaseReajuste: c.dataBaseReajuste,
    multaRescisao: c.multaRescisao === null ? null : Number(c.multaRescisao),
  }
}

/**
 * Renova = contrato NOVO ligado ao antigo (D7). Numa transacao so: cria o
 * novo (codigo pelo ano do novo inicio, primeira vigencia "Renovação",
 * documento "Renovação" se vier arquivo) e encerra o antigo como "renovado".
 * Documentos e auditoria ficam no antigo; cada um aponta para o outro.
 */
export async function renovarContrato(
  usuario: UsuarioSessao,
  contratoId: string,
  dados: DadosRenovar,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
  arquivo?: ArquivoValidado,
): Promise<ContratoDetalhe> {
  return comGravacao((gravacao) =>
    db.transaction(async (tx) => {
      const antigo = await carregar(tx, usuario, contratoId, true)
      exigirAberto(antigo, 'renovar')
      exigirVersao(antigo, dados.versao)
      if (dados.dataInicio <= antigo.dataInicio) {
        throw erroValidacao({ dataInicio: `A renovação precisa começar depois do início do contrato atual (${formatarData(antigo.dataInicio)}).` })
      }

      // Base = antigo; por cima, o que veio no pedido. Validado como um cadastro.
      const { versao: _v, ...pedido } = dados
      const definidos = Object.fromEntries(Object.entries(pedido).filter(([, v]) => v !== undefined))
      const novosDados = esquemaCriarContrato.parse({ ...baseDoAntigo(antigo), ...definidos })

      const novo = await inserirContrato(tx, gravacao, usuario, novosDados, contexto, {
        tipoVigencia: 'Renovação',
        renovaContratoId: antigo.id,
        // Opcao desativada depois do cadastro do antigo pode seguir no renovado.
        opcoesHerdadas: {
          categoriaId: antigo.categoriaId,
          segmentoId: antigo.segmentoId,
          empresaId: antigo.empresaId,
          filialId: antigo.filialId,
          areaResponsavelId: antigo.areaResponsavelId,
          centroCustoId: antigo.centroCustoId,
        },
        verificarDuplicidade: false, // a sobreposicao com o antecessor e esperada
        descricaoAuditoria: `Cadastrou por renovação de ${antigo.codigo}`,
        arquivo: arquivo ? { arquivo, tipo: 'Renovação' } : undefined,
      })

      const quem = carimboDe(usuario)
      await tx
        .update(contratos)
        .set({
          encerradoEm: hoje,
          motivoEncerramento: 'renovado',
          justificativaEncerramento: `Renovado por ${novo.codigo}`,
          encerradoPorMatricula: quem.matricula,
          encerradoPorNome: quem.nome,
          renovadoPorContratoId: novo.id,
          ...(antigo.acaoVencimento ? { statusAcao: 'Concluída' as const } : {}),
          versao: antigo.versao + 1,
          atualizadoEm: new Date().toISOString(),
        })
        .where(eq(contratos.id, antigo.id))

      await registrarAuditoria(
        tx,
        {
          usuario: quem,
          categoria: 'contrato',
          acao: 'contrato.renovado',
          descricao: `Renovado por ${novo.codigo} (${formatarData(novo.dataInicio)} a ${formatarData(novo.dataFim)})`,
          contratoId: antigo.id,
          dados: { novoContratoId: novo.id, novoCodigo: novo.codigo },
        },
        contexto,
      )
      return montarDetalhe(tx, usuario, novo, hoje)
    }),
  )
}
