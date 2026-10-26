import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'

/**
 * As rotas pela borda HTTP: status, envelope de erro e Location. As regras
 * em si estao em lib/server/servicos/tarefas.banco.test.ts.
 */

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('@/lib/server/sessao', () => ({ obterSessao }))
vi.mock('@/lib/server/usuariosApp', () => ({ obterUsuariosDoApp: vi.fn(async () => null) }))

const { GET, POST } = await import('./route')
const { DELETE } = await import('./[id]/route')
const { POST: MOVER } = await import('./[id]/mover/route')
const { fecharBanco } = await import('@/lib/server/db/cliente')

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: '1', nome: 'Ana', email: 'a@x', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const COMUM: UsuarioSessao = { ...ADMIN, matricula: '2', cargo: 'FUNCIONARIO', nivel: 'leitura' }

const URL_BASE = 'http://localhost/api/v1/tarefas'
const NAO_EXISTE = '00000000-0000-4000-8000-000000000000'
const json = (metodo: string, url: string, corpo?: unknown) =>
  new NextRequest(url, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => obterSessao.mockResolvedValue(ADMIN))

describe('/api/v1/tarefas', () => {
  it('POST -> 201 com Location; GET traz no quadro; mover; DELETE', async () => {
    const criada = await POST(json('POST', URL_BASE, { titulo: 'Pela API', coluna: 'A fazer' }), {})
    expect(criada.status).toBe(201)
    const tarefa = await criada.json()
    expect(criada.headers.get('location')).toBe(`/api/v1/tarefas/${tarefa.id}`)
    expect(criada.headers.get('cache-control')).toBe('private, no-store')

    const quadro = await GET(json('GET', URL_BASE), {})
    expect(quadro.status).toBe(200)
    expect((await quadro.json()).itens.some((t: { id: string }) => t.id === tarefa.id)).toBe(true)

    const movida = await MOVER(json('POST', `${URL_BASE}/${tarefa.id}/mover`, { coluna: 'Concluída' }), params(tarefa.id))
    expect(movida.status).toBe(200)
    expect((await movida.json()).coluna).toBe('Concluída')

    const removida = await DELETE(json('DELETE', `${URL_BASE}/${tarefa.id}`, { justificativa: 'Teste da API' }), params(tarefa.id))
    expect(removida.status).toBe(200)
  })

  it('POST com título em branco -> 400 com mensagem do campo', async () => {
    const res = await POST(json('POST', URL_BASE, { titulo: '   ', coluna: 'A fazer' }), {})
    expect(res.status).toBe(400)
    expect((await res.json()).erro.campos.titulo).toBe('Informe o título.')
  })

  it('somente leitura: GET -> 200, POST -> 403 no envelope padrão', async () => {
    obterSessao.mockResolvedValue(COMUM)
    expect((await GET(json('GET', URL_BASE), {})).status).toBe(200)
    const res = await POST(json('POST', URL_BASE, { titulo: 'Não pode', coluna: 'A fazer' }), {})
    expect(res.status).toBe(403)
    expect((await res.json()).erro.codigo).toBe('SEM_PERMISSAO')
  })

  it('mover para coluna inválida -> 400; id inexistente ou malformado -> 404', async () => {
    expect((await MOVER(json('POST', `${URL_BASE}/x/mover`, { coluna: 'Feito' }), params(NAO_EXISTE))).status).toBe(400)
    expect((await MOVER(json('POST', `${URL_BASE}/x/mover`, { coluna: 'A fazer' }), params(NAO_EXISTE))).status).toBe(404)
    expect((await DELETE(json('DELETE', `${URL_BASE}/abc`, { justificativa: 'Qualquer' }), params('abc'))).status).toBe(404)
  })

  it('DELETE sem justificativa -> 400', async () => {
    const res = await DELETE(json('DELETE', `${URL_BASE}/x`, { justificativa: '' }), params(NAO_EXISTE))
    expect(res.status).toBe(400)
    expect((await res.json()).erro.campos.justificativa).toBeDefined()
  })

  it('sem sessão -> 401', async () => {
    obterSessao.mockResolvedValue(null)
    expect((await GET(json('GET', URL_BASE), {})).status).toBe(401)
  })
})
