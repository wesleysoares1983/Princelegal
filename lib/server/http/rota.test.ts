import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { UsuarioSessao } from '@/lib/usuario'
import { erroNaoEncontrado, erroRegraNegocio } from './erros'

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('../sessao', () => ({ obterSessao }))

const { respostaCriada, rota } = await import('./rota')
type ContextoRota = import('./rota').ContextoRota

const ANA: UsuarioSessao = { matricula: '100', nome: 'Ana', email: 'a@x', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const req = (cabecalhos: Record<string, string> = {}) => new NextRequest('http://localhost/api/v1/x', { headers: cabecalhos })

beforeEach(() => obterSessao.mockResolvedValue(ANA))

describe('rota()', () => {
  it('entrega usuário e origem ao handler e responde JSON sem cache', async () => {
    const handler = vi.fn(async (_contexto: ContextoRota) => ({ ok: 1 }))
    const res = await rota(handler)(req({ 'x-forwarded-for': '10.0.0.5, 172.16.0.1', 'user-agent': 'teste' }), {})
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ ok: 1 })
    expect(handler.mock.calls[0][0]).toEqual({ usuario: ANA, auditoria: { ip: '10.0.0.5', userAgent: 'teste' } })
  })

  it('IP inválido no cabeçalho vira null (a coluna é inet)', async () => {
    const handler = vi.fn(async (_contexto: ContextoRota) => null)
    await rota(handler)(req({ 'x-forwarded-for': 'lixo' }), {})
    expect(handler.mock.calls[0]![0].auditoria.ip).toBeNull()
  })

  it('sem sessão -> 401 no envelope padrão, sem chamar o handler', async () => {
    obterSessao.mockResolvedValue(null)
    const handler = vi.fn()
    const res = await rota(handler)(req(), {})
    expect(res.status).toBe(401)
    expect((await res.json()).erro.codigo).toBe('NAO_AUTENTICADO')
    expect(handler).not.toHaveBeenCalled()
  })

  it('erro de domínio -> status e corpo dele', async () => {
    const res = await rota(async () => {
      throw erroRegraNegocio('Contrato encerrado.')
    })(req(), {})
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ erro: { codigo: 'REGRA_NEGOCIO', mensagem: 'Contrato encerrado.' } })
    expect((await rota(async () => { throw erroNaoEncontrado() })(req(), {})).status).toBe(404)
  })

  it('zod -> 400 VALIDACAO com mensagem por campo', async () => {
    const esquema = z.object({ nome: z.string().min(3, 'Nome muito curto.'), itens: z.array(z.number()) })
    const res = await rota(async () => esquema.parse({ nome: 'a', itens: ['x'] }))(req(), {})
    expect(res.status).toBe(400)
    const { erro } = await res.json()
    expect(erro.codigo).toBe('VALIDACAO')
    expect(erro.campos.nome).toBe('Nome muito curto.')
    expect(erro.campos['itens.0']).toBeDefined()
  })

  it('erro inesperado -> 500 com idRastreio e sem detalhe interno', async () => {
    const res = await rota(async () => {
      throw new Error('senha do banco: hunter2')
    })(req(), {})
    expect(res.status).toBe(500)
    const corpo = await res.json()
    expect(corpo.erro.codigo).toBe('ERRO_INTERNO')
    expect(corpo.erro.idRastreio).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.stringify(corpo)).not.toContain('hunter2')
  })

  it('Response pronto passa direto (ex.: 201 com Location)', async () => {
    const res = await rota(async () => respostaCriada({ id: '1' }, '/api/v1/x/1'))(req(), {})
    expect(res.status).toBe(201)
    expect(res.headers.get('location')).toBe('/api/v1/x/1')
  })
})
