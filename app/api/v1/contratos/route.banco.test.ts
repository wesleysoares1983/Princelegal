import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'

/** Rotas de contrato pela borda HTTP; as regras estão em lib/server/servicos/contratos.banco.test.ts. */

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('@/lib/server/sessao', () => ({ obterSessao }))

const { GET: LISTAR, POST: CRIAR } = await import('./route')
const { GET: DETALHE, PATCH: EDITAR } = await import('./[id]/route')
const { GET: PAINEL } = await import('../painel/route')
const { GET: AUDITORIA } = await import('../auditoria/route')
const { db, fecharBanco } = await import('@/lib/server/db/cliente')
const { opcoesCadastro } = await import('@/lib/server/db/esquema')

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: 'RA', nome: 'Rota Admin', email: 'rota.admin@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const COMUM: UsuarioSessao = { matricula: 'RC', nome: 'Rota Comum', email: 'rota.comum@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }

const BASE = 'http://localhost/api/v1/contratos'
const req = (metodo: string, url: string, corpo?: unknown) =>
  new NextRequest(url, { method: metodo, headers: { 'content-type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

let corpoValido: Record<string, unknown>

beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) => {
    const [o] = await db.select().from(opcoesCadastro).where(eq(opcoesCadastro.campo, campo)).limit(1)
    return o.id
  }
  corpoValido = {
    nome: 'Contrato pela rota',
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Rota',
    fornecedorDocumento: '12.ABC.345/01DE-35',
    objeto: 'Objeto da rota',
    gestorNome: 'Gestor',
    gestorEmail: 'gestor.rota@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'juridico.rota@x.com',
    dataInicio: '2026-02-01',
    dataFim: '2027-01-31',
    renovacaoAutomatica: true,
    prazoAvisoCancelamentoDias: 60,
    valorMensal: 1234.56,
    formaPagamento: 'Pix',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2026-02-01',
    confirmarDuplicidade: true,
  }
})

beforeEach(() => obterSessao.mockResolvedValue(ADMIN))

describe('/api/v1/contratos', () => {
  it('POST -> 201 com Location; CNPJ alfanumérico aceito e devolvido formatado', async () => {
    const res = await CRIAR(req('POST', BASE, corpoValido), {})
    expect(res.status).toBe(201)
    const c = await res.json()
    expect(res.headers.get('location')).toBe(`/api/v1/contratos/${c.id}`)
    expect(c.fornecedorDocumento).toBe('12.ABC.345/01DE-35')
    expect(c.codigo).toMatch(/^CTR-2026-\d{6}$/)
  })

  it('POST com término antes do início e CPF inválido -> 400 com os dois campos', async () => {
    const res = await CRIAR(req('POST', BASE, { ...corpoValido, dataFim: '2025-01-01', fornecedorDocumento: '111.111.111-11' }), {})
    expect(res.status).toBe(400)
    const { erro } = await res.json()
    expect(erro.campos.dataFim).toMatch(/término/)
    expect(erro.campos.fornecedorDocumento).toMatch(/inválido/)
  })

  it('GET lista paginada; status inválido -> 400', async () => {
    const ok = await LISTAR(req('GET', `${BASE}?status=ativos&porPagina=5`), {})
    expect(ok.status).toBe(200)
    expect((await ok.json()).porPagina).toBe(5)
    expect((await LISTAR(req('GET', `${BASE}?status=quase`), {})).status).toBe(400)
  })

  it('PATCH recusa vigência/valor ("altere via aditivo") e campo desconhecido', async () => {
    const criado = await (await CRIAR(req('POST', BASE, corpoValido), {})).json()
    let res = await EDITAR(req('PATCH', `${BASE}/${criado.id}`, { versao: 1, dataFim: '2030-01-01', valorMensal: 1 }), params(criado.id))
    expect(res.status).toBe(400)
    const { erro } = await res.json()
    expect(erro.campos.dataFim).toMatch(/aditivo/)
    expect(erro.campos.valorMensal).toMatch(/aditivo/)
    res = await EDITAR(req('PATCH', `${BASE}/${criado.id}`, { versao: 1, campoInventado: 1 }), params(criado.id))
    expect(res.status).toBe(400)
  })

  it('restrito invisível -> 404 (nunca 403); id malformado -> 404', async () => {
    const restrito = await (await CRIAR(req('POST', BASE, { ...corpoValido, acessoRestrito: true }), {})).json()
    obterSessao.mockResolvedValue(COMUM)
    expect((await DETALHE(req('GET', `${BASE}/${restrito.id}`), params(restrito.id))).status).toBe(404)
    expect((await DETALHE(req('GET', `${BASE}/xyz`), params('xyz'))).status).toBe(404)
  })

  it('painel e auditoria respondem 200', async () => {
    expect((await PAINEL(req('GET', 'http://localhost/api/v1/painel'), {})).status).toBe(200)
    const aud = await AUDITORIA(req('GET', 'http://localhost/api/v1/auditoria?pagina=1'), {})
    expect(aud.status).toBe(200)
    expect((await aud.json()).facetas.usuarios).toBeInstanceOf(Array)
  })
})
