import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'

/**
 * As rotas pela borda HTTP: status, envelope de erro e Location. As regras
 * em si estao em lib/server/servicos/opcoes.banco.test.ts.
 */

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('@/lib/server/sessao', () => ({ obterSessao }))

const { GET, POST } = await import('./route')
const { PATCH } = await import('./[id]/route')
const { POST: DESATIVAR } = await import('./[id]/desativar/route')
const { fecharBanco } = await import('@/lib/server/db/cliente')

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: '1', nome: 'Ana', email: 'a@x', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const COMUM: UsuarioSessao = { ...ADMIN, matricula: '2', cargo: 'USUARIO', nivel: 'user' }

const URL_BASE = 'http://localhost/api/v1/opcoes-cadastro'
const json = (metodo: string, url: string, corpo?: unknown) =>
  new NextRequest(url, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => obterSessao.mockResolvedValue(ADMIN))

describe('/api/v1/opcoes-cadastro', () => {
  it('GET -> 200 com todos os campos', async () => {
    const res = await GET(json('GET', URL_BASE), {})
    expect(res.status).toBe(200)
    expect(Object.keys(await res.json())).toHaveLength(6)
  })

  it('GET com campo inválido -> 400 VALIDACAO', async () => {
    const res = await GET(json('GET', `${URL_BASE}?campo=cor`), {})
    expect(res.status).toBe(400)
    expect((await res.json()).erro.campos.campo).toBe('Campo inválido.')
  })

  it('POST -> 201 com Location', async () => {
    const res = await POST(json('POST', URL_BASE, { campo: 'filial', valor: 'Londrina' }), {})
    expect(res.status).toBe(201)
    const opcao = await res.json()
    expect(res.headers.get('location')).toBe(`/api/v1/opcoes-cadastro/${opcao.id}`)
  })

  it('POST de usuário comum -> 403 no envelope padrão', async () => {
    obterSessao.mockResolvedValue(COMUM)
    const res = await POST(json('POST', URL_BASE, { campo: 'filial', valor: 'Maringá' }), {})
    expect(res.status).toBe(403)
    expect((await res.json()).erro.codigo).toBe('SEM_PERMISSAO')
  })

  it('POST com valor vazio -> 400 com mensagem do campo', async () => {
    const res = await POST(json('POST', URL_BASE, { campo: 'filial', valor: '   ' }), {})
    expect(res.status).toBe(400)
    expect((await res.json()).erro.campos.valor).toBe('Informe o valor.')
  })

  it('PATCH sem nada para alterar -> 400', async () => {
    const res = await PATCH(json('PATCH', `${URL_BASE}/x`, { versao: 1 }), params('00000000-0000-4000-8000-000000000000'))
    expect(res.status).toBe(400)
  })

  it('id malformado -> 404 (nunca chega ao banco)', async () => {
    const res = await DESATIVAR(json('POST', `${URL_BASE}/abc/desativar`), params('abc'))
    expect(res.status).toBe(404)
  })
})
