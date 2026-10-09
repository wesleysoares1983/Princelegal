import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'

/** Upload e download pela borda HTTP (multipart, 413/415, cabeçalhos do arquivo). */

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('@/lib/server/sessao', () => ({ obterSessao }))

const { POST: CRIAR_CONTRATO } = await import('../contratos/route')
const { GET: LISTAR_DOCS, POST: ENVIAR } = await import('../contratos/[id]/documentos/route')
const { GET: BAIXAR } = await import('./[id]/versoes/[versao]/arquivo/route')
const { db, fecharBanco } = await import('@/lib/server/db/cliente')
const { opcoesCadastro } = await import('@/lib/server/db/esquema')

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: 'HA', nome: 'Http Admin', email: 'http@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
beforeEach(() => obterSessao.mockResolvedValue(ADMIN))

const PDF = Buffer.from('%PDF-1.7\nconteúdo\n%%EOF', 'latin1')
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')])
const EXE = Buffer.from('MZ\x90\x00 executavel', 'latin1')

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })

function multipart(url: string, campos: Record<string, string>, arquivo?: { nome: string; bytes: Buffer }) {
  const form = new FormData()
  for (const [k, v] of Object.entries(campos)) form.set(k, v)
  if (arquivo) form.set('arquivo', new File([new Uint8Array(arquivo.bytes)], arquivo.nome))
  return new NextRequest(url, { method: 'POST', body: form })
}

let dadosContrato: Record<string, unknown>
beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) =>
    (await db.select().from(opcoesCadastro).where(and(eq(opcoesCadastro.campo, campo), eq(opcoesCadastro.ativo, true))).limit(1))[0].id
  dadosContrato = {
    nome: 'Contrato com arquivo via HTTP',
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor HTTP',
    fornecedorDocumento: '52998224725',
    objeto: 'Objeto',
    gestorNome: 'Gestor Http',
    gestorEmail: 'g@x.com',
    responsavelJuridicoNome: 'Jurídico Http',
    responsavelJuridicoEmail: 'j@x.com',
    dataInicio: '2026-01-01',
    dataFim: '2026-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 10,
    formaPagamento: 'Pix',
    indiceReajuste: 'Fixo',
    dataBaseReajuste: '2026-01-01',
    confirmarDuplicidade: true,
  }
})

describe('upload e download pela API', () => {
  let contratoId = ''

  it('POST /contratos multipart: contrato + contrato assinado num pedido só', async () => {
    const res = await CRIAR_CONTRATO(
      multipart('http://localhost/api/v1/contratos', { dados: JSON.stringify(dadosContrato) }, { nome: 'Contrato Locação – Assinado.pdf', bytes: PDF }),
      {},
    )
    expect(res.status).toBe(201)
    contratoId = (await res.json()).id
    const docs = await (await LISTAR_DOCS(new NextRequest(`http://localhost/x`), params({ id: contratoId }))).json()
    expect(docs).toHaveLength(1)
    expect(docs[0].tipo).toBe('Contrato')
  })

  it('executável renomeado -> 415; acima do limite (2 MB nos testes) -> 413; sem arquivo -> 400', async () => {
    const url = `http://localhost/api/v1/contratos/${contratoId}/documentos`
    let res = await ENVIAR(multipart(url, { tipo: 'Anexo' }, { nome: 'nota.pdf', bytes: EXE }), params({ id: contratoId }))
    expect(res.status).toBe(415)
    const grande = Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024 + 10, 0x20)])
    res = await ENVIAR(multipart(url, { tipo: 'Anexo' }, { nome: 'grande.pdf', bytes: grande }), params({ id: contratoId }))
    expect(res.status).toBe(413)
    res = await ENVIAR(multipart(url, { tipo: 'Anexo' }), params({ id: contratoId }))
    expect(res.status).toBe(400)
    res = await ENVIAR(multipart(url, { tipo: 'Planilha' }, { nome: 'a.pdf', bytes: PDF }), params({ id: contratoId }))
    expect(res.status).toBe(400)
  })

  it('download: nome com acento no Content-Disposition; inline só para PDF', async () => {
    const docs = await (await LISTAR_DOCS(new NextRequest(`http://localhost/x`), params({ id: contratoId }))).json()
    const url = (q = '') => new NextRequest(`http://localhost/api/v1/documentos/${docs[0].id}/versoes/atual/arquivo${q}`)
    let res = await BAIXAR(url(), params({ id: docs[0].id, versao: 'atual' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="Contrato Locacao _ Assinado.pdf"; filename*=UTF-8''${encodeURIComponent('Contrato Locação – Assinado.pdf')}`,
    )
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)

    res = await BAIXAR(url('?inline=1'), params({ id: docs[0].id, versao: 'atual' }))
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/)

    const word = await ENVIAR(
      multipart(`http://localhost/api/v1/contratos/${contratoId}/documentos`, { tipo: 'Anexo' }, { nome: 'minuta.docx', bytes: DOCX }),
      params({ id: contratoId }),
    )
    const w = await word.json()
    res = await BAIXAR(new NextRequest(`http://localhost/x?inline=1`), params({ id: w.id, versao: '1' }))
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect((await BAIXAR(new NextRequest('http://localhost/x'), params({ id: w.id, versao: 'zero' }))).status).toBe(404)
  })
})
