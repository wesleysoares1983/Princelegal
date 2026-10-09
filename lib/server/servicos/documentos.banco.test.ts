import { utimes, writeFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { and, desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { esquemaCriarContrato, type DadosCriarContrato } from '@/lib/shared/contratos'
import type { UsuarioSessao } from '@/lib/usuario'
import { listarArquivos } from '../armazenamento'
import { configArmazenamento } from '../config'
import { db, fecharBanco } from '../db/cliente'
import { auditoria, documentoVersoes, opcoesCadastro } from '../db/esquema'
import { ErroApi } from '../http/erros'
import { validarArquivo } from '../http/upload'
import { criarContrato, encerrarContrato } from './contratos'
import {
  abrirArquivo,
  enviarDocumento,
  enviarNovaVersao,
  limparArquivosOrfaos,
  listarDocumentos,
  removerDocumento,
  restaurarDocumento,
} from './documentos'

afterAll(fecharBanco)

const HOJE = '2026-10-09'
const CTX = { ip: '10.0.0.7', userAgent: 'vitest' }
const ADMIN: UsuarioSessao = { matricula: 'DA', nome: 'Dora Admin', email: 'dora@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const GESTOR: UsuarioSessao = { matricula: 'DG', nome: 'Davi Gestor', email: 'davi@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const OUTRO: UsuarioSessao = { matricula: 'DO', nome: 'Dina Outra', email: 'dina@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }

const pdf = (texto: string) => validarArquivo({ name: `${texto}.pdf`, bytes: new Uint8Array(Buffer.from(`%PDF-1.7\n${texto}\n%%EOF`)) })

async function lerTudo(corpo: ReadableStream<Uint8Array>): Promise<string> {
  return Buffer.from(await new Response(corpo).arrayBuffer()).toString('latin1')
}

async function falha(p: Promise<unknown>, codigo: string) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  )
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroApi)
  expect((e as ErroApi).codigo).toBe(codigo)
}

let base: Record<string, unknown>
let seq = 0
function dados(extra: Record<string, unknown> = {}): DadosCriarContrato {
  seq++
  return esquemaCriarContrato.parse({ ...base, nome: `Contrato docs ${seq}`, confirmarDuplicidade: true, ...extra })
}

beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) =>
    (await db.select().from(opcoesCadastro).where(and(eq(opcoesCadastro.campo, campo), eq(opcoesCadastro.ativo, true))).limit(1))[0].id
  base = {
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Docs',
    fornecedorDocumento: '11.222.333/0001-81',
    objeto: 'Objeto',
    gestorNome: 'Davi Gestor',
    gestorEmail: 'davi@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'jur@x.com',
    dataInicio: '2026-01-01',
    dataFim: '2027-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 100,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2026-01-01',
  }
})

const novo = (extra: Record<string, unknown> = {}, quem = GESTOR, arquivo?: ReturnType<typeof pdf>) =>
  criarContrato(quem, dados(extra), CTX, HOJE, arquivo)

describe('cadastro com o contrato assinado', () => {
  it('contrato e documento nascem juntos; o arquivo fica no disco', async () => {
    const c = await novo({}, GESTOR, pdf('assinado'))
    const docs = await listarDocumentos(GESTOR, c.id)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ tipo: 'Contrato', nome: 'assinado.pdf', versaoAtual: 1, atual: { mime: 'application/pdf', enviadoPor: { matricula: 'DG' } } })
    const arquivo = await abrirArquivo(GESTOR, docs[0].id, 'atual', CTX)
    expect(await lerTudo(arquivo.corpo)).toContain('assinado')
  })

  it('cadastro que falha não deixa arquivo para trás', async () => {
    const antes = (await listarArquivos()).length
    await falha(novo({ categoriaId: base.segmentoId }, GESTOR, pdf('nao-deve-ficar')), 'VALIDACAO')
    expect((await listarArquivos()).length).toBe(antes)
  })
})

describe('envio, versões e download', () => {
  it('envia, lista, gera versão 2; versão 1 continua baixável', async () => {
    const c = await novo()
    const doc = await enviarDocumento(GESTOR, c.id, { arquivo: pdf('parecer-v1'), tipo: 'Parecer jurídico', nome: 'Parecer sobre multa' }, CTX)
    expect(doc).toMatchObject({ nome: 'Parecer sobre multa', tipo: 'Parecer jurídico', versaoAtual: 1 })

    const v2 = await enviarNovaVersao(GESTOR, doc.id, pdf('parecer-v2'), CTX)
    expect(v2.versaoAtual).toBe(2)
    expect(v2.atual.nomeArquivo).toBe('parecer-v2.pdf')

    const [comVersoes] = await listarDocumentos(GESTOR, c.id, { incluirVersoes: true })
    expect(comVersoes.versoes!.map((v) => v.versao)).toEqual([2, 1])
    expect(await lerTudo((await abrirArquivo(GESTOR, doc.id, 1, CTX)).corpo)).toContain('parecer-v1')
    expect(await lerTudo((await abrirArquivo(GESTOR, doc.id, 'atual', CTX)).corpo)).toContain('parecer-v2')
  })

  it('arquivo idêntico a uma versão anterior -> CONFLITO', async () => {
    const c = await novo()
    const doc = await enviarDocumento(GESTOR, c.id, { arquivo: pdf('igual'), tipo: 'Anexo' }, CTX)
    await enviarNovaVersao(GESTOR, doc.id, pdf('diferente'), CTX)
    await falha(enviarNovaVersao(GESTOR, doc.id, pdf('igual'), CTX), 'CONFLITO')
  })

  it('cada download fica na trilha de acesso', async () => {
    const c = await novo({}, GESTOR, pdf('trilha'))
    const [doc] = await listarDocumentos(GESTOR, c.id)
    await abrirArquivo(OUTRO, doc.id, 'atual', CTX)
    const [ev] = await db.select().from(auditoria).where(eq(auditoria.contratoId, c.id)).orderBy(desc(auditoria.id)).limit(1)
    expect(ev).toMatchObject({ categoria: 'acesso', acao: 'documento.baixado', usuarioMatricula: 'DO' })
  })

  it('versão inexistente -> 404; arquivo sumido do disco -> 404 com aviso', async () => {
    const c = await novo({}, GESTOR, pdf('sumira'))
    const [doc] = await listarDocumentos(GESTOR, c.id)
    await falha(abrirArquivo(GESTOR, doc.id, 9, CTX), 'NAO_ENCONTRADO')
    const [v] = await db.select().from(documentoVersoes).where(eq(documentoVersoes.documentoId, doc.id))
    await rm(resolve(configArmazenamento().diretorio, v.chaveArmazenamento))
    await falha(abrirArquivo(GESTOR, doc.id, 'atual', CTX), 'NAO_ENCONTRADO')
  })
})

describe('permissões e estado do contrato', () => {
  it('contrato restrito: quem não vê recebe 404 em listar, enviar e baixar', async () => {
    const c = await novo({ acessoRestrito: true }, GESTOR, pdf('sigiloso'))
    const [doc] = await listarDocumentos(GESTOR, c.id)
    await falha(listarDocumentos(OUTRO, c.id), 'NAO_ENCONTRADO')
    await falha(enviarDocumento(OUTRO, c.id, { arquivo: pdf('x'), tipo: 'Anexo' }, CTX), 'NAO_ENCONTRADO')
    await falha(abrirArquivo(OUTRO, doc.id, 'atual', CTX), 'NAO_ENCONTRADO')
  })

  it('remover: some da lista; só admin vê removidos, baixa e restaura', async () => {
    const c = await novo({}, GESTOR, pdf('removivel'))
    const [doc] = await listarDocumentos(GESTOR, c.id)
    await removerDocumento(OUTRO, doc.id, 'Enviado no contrato errado', CTX)

    expect(await listarDocumentos(GESTOR, c.id)).toHaveLength(0)
    expect(await listarDocumentos(GESTOR, c.id, { incluirRemovidos: true })).toHaveLength(0) // pedido ignorado
    const [doAdmin] = await listarDocumentos(ADMIN, c.id, { incluirRemovidos: true })
    expect(doAdmin.removido).toMatchObject({ motivo: 'Enviado no contrato errado', por: { matricula: 'DO' } })

    await falha(abrirArquivo(GESTOR, doc.id, 'atual', CTX), 'NAO_ENCONTRADO')
    await abrirArquivo(ADMIN, doc.id, 'atual', CTX) // admin ainda baixa
    await falha(enviarNovaVersao(ADMIN, doc.id, pdf('nova'), CTX), 'REGRA_NEGOCIO')
    await falha(restaurarDocumento(GESTOR, doc.id, CTX), 'SEM_PERMISSAO')

    const r = await restaurarDocumento(ADMIN, doc.id, CTX)
    expect(r.removido).toBeNull()
    expect(await listarDocumentos(GESTOR, c.id)).toHaveLength(1)
  })

  it('contrato encerrado: documentos só para consulta; admin ainda restaura', async () => {
    const c = await novo({}, GESTOR, pdf('antes-de-encerrar'))
    const [doc] = await listarDocumentos(GESTOR, c.id)
    await removerDocumento(GESTOR, doc.id, 'Remover antes de encerrar', CTX)
    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim do contrato' }, CTX, HOJE)

    await falha(enviarDocumento(GESTOR, c.id, { arquivo: pdf('depois'), tipo: 'Anexo' }, CTX), 'REGRA_NEGOCIO')
    await restaurarDocumento(ADMIN, doc.id, CTX)
    await falha(removerDocumento(ADMIN, doc.id, 'De novo', CTX), 'REGRA_NEGOCIO')
    await abrirArquivo(GESTOR, doc.id, 'atual', CTX) // consulta continua
  })
})

describe('limpeza de arquivos órfãos', () => {
  it('apaga órfão antigo e temporário esquecido; preserva o recente e os que têm linha no banco', async () => {
    const c = await novo({}, GESTOR, pdf('legitimo'))
    const raiz = resolve(configArmazenamento().diretorio)
    const orfaoVelho = join(raiz, 'contratos', c.id, '00000000-0000-4000-8000-000000000001')
    const orfaoNovo = join(raiz, 'contratos', c.id, '00000000-0000-4000-8000-000000000002')
    const tmpVelho = join(raiz, '.tmp', 'esquecido')
    for (const f of [orfaoVelho, orfaoNovo, tmpVelho]) {
      await mkdir(dirname(f), { recursive: true })
      await writeFile(f, 'x')
    }
    const doisDias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    await utimes(orfaoVelho, doisDias, doisDias)
    await utimes(tmpVelho, doisDias, doisDias)
    // O arquivo legitimo tambem "envelhece": tem linha no banco, nao pode sumir.
    const [v] = await db.select().from(documentoVersoes).orderBy(desc(documentoVersoes.enviadoEm)).limit(1)
    await utimes(resolve(raiz, v.chaveArmazenamento), doisDias, doisDias)

    expect(await limparArquivosOrfaos()).toBe(2)
    const restantes = (await listarArquivos()).map((a) => a.caminho)
    expect(restantes).toContain(orfaoNovo)
    expect(restantes).toContain(resolve(raiz, v.chaveArmazenamento))
    expect(restantes).not.toContain(orfaoVelho)
    expect(restantes).not.toContain(tmpVelho)
  })
})
