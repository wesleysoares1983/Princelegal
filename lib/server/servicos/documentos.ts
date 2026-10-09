import 'server-only'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Documento, TipoDocumento, VersaoDocumento } from '@/lib/shared/documentos'
import type { UsuarioSessao } from '@/lib/usuario'
import { abrir, comGravacao, type Gravacao } from '../armazenamento'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { ehAdmin, exigirAdmin } from '../auth'
import { db, type Executor } from '../db/cliente'
import { contratos, documentos, documentoVersoes } from '../db/esquema'
import { erroConflito, erroNaoEncontrado, erroRegraNegocio } from '../http/erros'
import type { ArquivoValidado } from '../http/upload'
import { podeVer } from '../permissoes'
import { carregar, isoInstante } from './contratos'

/**
 * Documentos do contrato (docs/BACKEND_IMPLEMENTATION.md §8.7, D13).
 *
 * - Ver/baixar: quem ve o contrato. Documento removido: so administrador.
 * - Enviar, nova versao, remover: quem pode editar o contrato, aberto.
 * - Restaurar: administrador (inclusive em contrato encerrado).
 * - Nada e apagado: remover marca a linha; versoes antigas ficam baixaveis.
 * - Todo download fica na trilha de acesso (LGPD).
 */

type LinhaDoc = typeof documentos.$inferSelect
type LinhaVersao = typeof documentoVersoes.$inferSelect

const carimbo = (matricula: string | null, nome: string | null) => (matricula ? { matricula, nome: nome ?? matricula } : null)
const carimboDe = (u: UsuarioSessao) => ({ matricula: u.matricula, nome: u.nome })

function paraVersao(v: LinhaVersao): VersaoDocumento {
  return {
    versao: v.versao,
    nomeArquivo: v.nomeArquivo,
    mime: v.mime,
    tamanhoBytes: v.tamanhoBytes,
    enviadoEm: isoInstante(v.enviadoEm),
    enviadoPor: { matricula: v.enviadoPorMatricula, nome: v.enviadoPorNome },
  }
}

function paraDocumento(d: LinhaDoc, versoes: LinhaVersao[], incluirVersoes: boolean): Documento {
  const ordenadas = [...versoes].sort((a, b) => b.versao - a.versao)
  const atual = ordenadas.find((v) => v.versao === d.versaoAtual) ?? ordenadas[0]
  return {
    id: d.id,
    contratoId: d.contratoId,
    tipo: d.tipo,
    nome: d.nome,
    versaoAtual: d.versaoAtual,
    atual: paraVersao(atual),
    ...(incluirVersoes ? { versoes: ordenadas.map(paraVersao) } : {}),
    removido: d.removidoEm
      ? { em: isoInstante(d.removidoEm), por: carimbo(d.removidoPorMatricula, d.removidoPorNome), motivo: d.motivoRemocao }
      : null,
  }
}

async function versoesDe(ex: Executor, ids: string[]) {
  if (!ids.length) return [] as LinhaVersao[]
  return ex.select().from(documentoVersoes).where(inArray(documentoVersoes.documentoId, ids))
}

/**
 * Documento + contrato, aplicando visibilidade: 404 se o usuario nao ve o
 * contrato, ou se o documento esta removido e ele nao e administrador.
 */
async function carregarDocumento(ex: Executor, usuario: UsuarioSessao, id: string, travar = false) {
  const consulta = ex.select({ d: documentos, c: contratos }).from(documentos).innerJoin(contratos, eq(contratos.id, documentos.contratoId)).where(eq(documentos.id, id))
  const [linha] = travar ? await consulta.for('update', { of: documentos }) : await consulta
  if (!linha || !podeVer(usuario, linha.c)) throw erroNaoEncontrado('Documento não encontrado.')
  if (linha.d.removidoEm && !ehAdmin(usuario)) throw erroNaoEncontrado('Documento não encontrado.')
  return linha
}

function exigirContratoAberto(c: { encerradoEm: string | null }) {
  if (c.encerradoEm) throw erroRegraNegocio('Contrato encerrado: os documentos ficam somente para consulta.')
}

// ---------------------------------------------------------------- leitura

export async function listarDocumentos(
  usuario: UsuarioSessao,
  contratoId: string,
  opcoes: { incluirRemovidos?: boolean; incluirVersoes?: boolean } = {},
): Promise<Documento[]> {
  await carregar(db, usuario, contratoId)
  const incluirRemovidos = opcoes.incluirRemovidos === true && ehAdmin(usuario)
  const docs = await db
    .select()
    .from(documentos)
    .where(and(eq(documentos.contratoId, contratoId), incluirRemovidos ? undefined : isNull(documentos.removidoEm)))
    .orderBy(asc(documentos.tipo), asc(documentos.criadoEm))
  const versoes = await versoesDe(db, docs.map((d) => d.id))
  return docs.map((d) =>
    paraDocumento(
      d,
      versoes.filter((v) => v.documentoId === d.id),
      opcoes.incluirVersoes === true,
    ),
  )
}

// ---------------------------------------------------------------- envio

export interface DadosNovoDocumento {
  arquivo: ArquivoValidado
  tipo: TipoDocumento
  nome?: string
}

/**
 * Cria documento + versao 1 dentro de uma transacao ja aberta (usado tambem
 * pelo cadastro de contrato, que anexa o contrato assinado na mesma transacao).
 */
export async function inserirDocumento(
  tx: Executor,
  gravacao: Gravacao,
  usuario: UsuarioSessao,
  contratoId: string,
  dados: DadosNovoDocumento,
  contexto: ContextoAuditoria,
): Promise<Documento> {
  const quem = carimboDe(usuario)
  const nome = dados.nome ?? dados.arquivo.nomeArquivo
  const [doc] = await tx.insert(documentos).values({ contratoId, tipo: dados.tipo, nome, versaoAtual: 1 }).returning()
  const chave = await gravacao.gravar(contratoId, dados.arquivo.bytes)
  const [versao] = await tx
    .insert(documentoVersoes)
    .values({
      documentoId: doc.id,
      versao: 1,
      nomeArquivo: dados.arquivo.nomeArquivo,
      mime: dados.arquivo.mime,
      tamanhoBytes: dados.arquivo.tamanhoBytes,
      sha256: dados.arquivo.sha256,
      chaveArmazenamento: chave,
      enviadoPorMatricula: quem.matricula,
      enviadoPorNome: quem.nome,
    })
    .returning()
  await registrarAuditoria(
    tx,
    {
      usuario: quem,
      categoria: 'documento',
      acao: 'documento.enviado',
      descricao: `Anexou ${nome} (${dados.tipo})`,
      contratoId,
      dados: { documentoId: doc.id, versao: 1, sha256: dados.arquivo.sha256, tamanhoBytes: dados.arquivo.tamanhoBytes },
    },
    contexto,
  )
  return paraDocumento(doc, [versao], false)
}

export async function enviarDocumento(
  usuario: UsuarioSessao,
  contratoId: string,
  dados: DadosNovoDocumento,
  contexto: ContextoAuditoria,
): Promise<Documento> {
  return comGravacao((gravacao) =>
    db.transaction(async (tx) => {
      const c = await carregar(tx, usuario, contratoId, true)
      exigirContratoAberto(c)
      return inserirDocumento(tx, gravacao, usuario, contratoId, dados, contexto)
    }),
  )
}

export async function enviarNovaVersao(
  usuario: UsuarioSessao,
  documentoId: string,
  arquivo: ArquivoValidado,
  contexto: ContextoAuditoria,
): Promise<Documento> {
  return comGravacao((gravacao) =>
    db.transaction(async (tx) => {
      const { d, c } = await carregarDocumento(tx, usuario, documentoId, true)
      exigirContratoAberto(c)
      if (d.removidoEm) throw erroRegraNegocio('Documento removido: restaure-o antes de enviar uma nova versão.')

      const anteriores = await versoesDe(tx, [d.id])
      const igual = anteriores.find((v) => v.sha256 === arquivo.sha256)
      if (igual) throw erroConflito(`Arquivo idêntico à versão ${igual.versao} — nada a atualizar.`)

      const proxima = d.versaoAtual + 1
      const quem = carimboDe(usuario)
      const chave = await gravacao.gravar(c.id, arquivo.bytes)
      const [nova] = await tx
        .insert(documentoVersoes)
        .values({
          documentoId: d.id,
          versao: proxima,
          nomeArquivo: arquivo.nomeArquivo,
          mime: arquivo.mime,
          tamanhoBytes: arquivo.tamanhoBytes,
          sha256: arquivo.sha256,
          chaveArmazenamento: chave,
          enviadoPorMatricula: quem.matricula,
          enviadoPorNome: quem.nome,
        })
        .returning()
      const [atualizado] = await tx.update(documentos).set({ versaoAtual: proxima }).where(eq(documentos.id, d.id)).returning()

      await registrarAuditoria(
        tx,
        {
          usuario: quem,
          categoria: 'documento',
          acao: 'documento.nova_versao',
          descricao: `Enviou a versão ${proxima} de ${d.nome}`,
          contratoId: c.id,
          dados: { documentoId: d.id, versao: proxima, sha256: arquivo.sha256 },
        },
        contexto,
      )
      return paraDocumento(atualizado, [...anteriores, nova], false)
    }),
  )
}

// ---------------------------------------------------------------- remover / restaurar

export async function removerDocumento(usuario: UsuarioSessao, documentoId: string, motivo: string, contexto: ContextoAuditoria): Promise<Documento> {
  return db.transaction(async (tx) => {
    const { d, c } = await carregarDocumento(tx, usuario, documentoId, true)
    exigirContratoAberto(c)
    if (d.removidoEm) throw erroRegraNegocio('Este documento já foi removido.')
    const quem = carimboDe(usuario)
    const [removido] = await tx
      .update(documentos)
      .set({ removidoEm: new Date().toISOString(), removidoPorMatricula: quem.matricula, removidoPorNome: quem.nome, motivoRemocao: motivo })
      .where(eq(documentos.id, d.id))
      .returning()
    await registrarAuditoria(
      tx,
      { usuario: quem, categoria: 'documento', acao: 'documento.removido', descricao: `Removeu ${d.nome} — ${motivo}`, contratoId: c.id, dados: { documentoId: d.id, motivo } },
      contexto,
    )
    return paraDocumento(removido, await versoesDe(tx, [d.id]), false)
  })
}

export async function restaurarDocumento(usuario: UsuarioSessao, documentoId: string, contexto: ContextoAuditoria): Promise<Documento> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const { d, c } = await carregarDocumento(tx, usuario, documentoId, true)
    if (!d.removidoEm) throw erroRegraNegocio('Este documento não está removido.')
    const [restaurado] = await tx
      .update(documentos)
      .set({ removidoEm: null, removidoPorMatricula: null, removidoPorNome: null, motivoRemocao: null })
      .where(eq(documentos.id, d.id))
      .returning()
    await registrarAuditoria(
      tx,
      { usuario: carimboDe(usuario), categoria: 'documento', acao: 'documento.restaurado', descricao: `Restaurou ${d.nome}`, contratoId: c.id, dados: { documentoId: d.id } },
      contexto,
    )
    return paraDocumento(restaurado, await versoesDe(tx, [d.id]), false)
  })
}

// ---------------------------------------------------------------- download

export async function abrirArquivo(
  usuario: UsuarioSessao,
  documentoId: string,
  versao: number | 'atual',
  contexto: ContextoAuditoria,
): Promise<{ corpo: ReadableStream<Uint8Array>; tamanho: number; mime: string; nomeArquivo: string }> {
  const { d, c } = await carregarDocumento(db, usuario, documentoId)
  const numero = versao === 'atual' ? d.versaoAtual : versao
  const [v] = await db
    .select()
    .from(documentoVersoes)
    .where(and(eq(documentoVersoes.documentoId, d.id), eq(documentoVersoes.versao, numero)))
  if (!v) throw erroNaoEncontrado('Versão não encontrada.')

  let arquivo
  try {
    arquivo = await abrir(v.chaveArmazenamento)
  } catch {
    // Linha existe mas o arquivo nao: volume perdido ou restauracao incompleta.
    throw erroNaoEncontrado('O arquivo desta versão não está disponível no armazenamento. Avise o suporte.')
  }

  await registrarAuditoria(
    db,
    {
      usuario: carimboDe(usuario),
      categoria: 'acesso',
      acao: 'documento.baixado',
      descricao: `Baixou ${v.nomeArquivo} (versão ${v.versao})`,
      contratoId: c.id,
      dados: { documentoId: d.id, versao: v.versao },
    },
    contexto,
  )
  return { corpo: arquivo.corpo, tamanho: arquivo.tamanho, mime: v.mime, nomeArquivo: v.nomeArquivo }
}

// ---------------------------------------------------------------- limpeza

/**
 * Apaga do disco arquivos sem linha no banco e temporarios esquecidos, mais
 * velhos que `idadeMinimaMs` (padrao 24 h -- nunca mexe num upload em curso).
 * Chamado pelo job semanal (M6); devolve quantos apagou.
 */
export async function limparArquivosOrfaos(idadeMinimaMs = 24 * 60 * 60 * 1000): Promise<number> {
  const { listarArquivos, descartar } = await import('../armazenamento')
  const limite = Date.now() - idadeMinimaMs
  const candidatos = (await listarArquivos()).filter((a) => a.modificadoEm.getTime() < limite)
  const chaves = candidatos.map((a) => a.chave).filter((c): c is string => c !== null)
  const conhecidas = new Set(
    chaves.length
      ? (await db.select({ chave: documentoVersoes.chaveArmazenamento }).from(documentoVersoes).where(inArray(documentoVersoes.chaveArmazenamento, chaves))).map(
          (r) => r.chave,
        )
      : [],
  )
  const orfaos = candidatos.filter((a) => a.chave === null || !conhecidas.has(a.chave))
  for (const a of orfaos) await descartar(a.caminho)
  return orfaos.length
}

