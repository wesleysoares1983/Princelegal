import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verificar } from '@/lib/server/token'
import { POST } from './route'

/**
 * Login contra uma API central simulada (fetch falso): confere a traducao de
 * cada resposta dos Apps Princesa e o cookie de sessao emitido.
 */

const SEGREDO = process.env.SESSION_SECRET!
const fetchFalso = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchFalso.mockReset()
  vi.stubGlobal('fetch', fetchFalso)
})
afterEach(() => vi.unstubAllGlobals())

function central(status: number, corpo: unknown) {
  fetchFalso.mockResolvedValue(Response.json(corpo, { status }))
}

function entrar(corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3400/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cabecalhos },
      body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    }),
  )
}

const USUARIO = { matricula: '100', nome: 'Ana', email: 'ana@empresa.com', perfil: 'Jurídico', cargo: 'ADMIN' }

describe('POST /api/auth/login', () => {
  it('sucesso: abre sessão com nível derivado do cargo e devolve o destino', async () => {
    central(200, { sucesso: true, usuario: USUARIO })
    const res = await entrar({ usuario: '100', senha: 's', lembrar: true, destino: '/contratos' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, destino: '/contratos' })
    const cookie = res.cookies.get('cj_sessao')!
    expect(cookie.httpOnly).toBe(true)
    expect(cookie.maxAge).toBe(30 * 24 * 60 * 60) // lembrar
    const token = verificar<{ u: { nivel: string; matricula: string }; l: boolean; exp: number }>(cookie.value, SEGREDO)
    expect(token?.u).toMatchObject({ matricula: '100', nivel: 'admin' })
    expect(token?.l).toBe(true)
  })

  it('envia matrícula/e-mail, senha e APP_ID com a chave interna, backend a backend', async () => {
    central(200, { sucesso: true, usuario: USUARIO })
    await entrar({ usuario: ' ana@empresa.com ', senha: ' s ' })
    const [url, init] = fetchFalso.mock.calls[0]
    expect(url).toBe('http://apps-princesa.teste/api/interno/usuarios/login')
    expect((init!.headers as Record<string, string>)['X-Internal-Key']).toBe('chave-de-teste')
    expect(JSON.parse(init!.body as string)).toEqual({ usuario: 'ana@empresa.com', senha: ' s ', app_id: 10 })
  })

  it('sem "lembrar": cookie de sessão do navegador (sem maxAge)', async () => {
    central(200, { sucesso: true, usuario: { ...USUARIO, cargo: null } })
    const res = await entrar({ usuario: '100', senha: 's' })
    expect(res.cookies.get('cj_sessao')!.maxAge).toBeUndefined()
  })

  it('destino externo é trocado por "/"', async () => {
    central(200, { sucesso: true, usuario: USUARIO })
    const res = await entrar({ usuario: '100', senha: 's', destino: '//evil.example' })
    expect((await res.json()).destino).toBe('/')
  })

  it.each([
    [401, 'credenciais_invalidas', 401],
    [403, 'usuario_inativo', 403],
    [403, 'sem_acesso_app', 403],
  ])('central %i %s -> %i, sem sessão', async (statusCentral, erro, esperado) => {
    central(statusCentral, { sucesso: false, erro })
    const res = await entrar({ usuario: '100', senha: 's' })
    expect(res.status).toBe(esperado)
    expect((await res.json()).erro).toBe(erro)
    expect(res.cookies.get('cj_sessao')).toBeUndefined()
  })

  it('senha temporária: manda trocar nos Apps Princesa e volta pelo nosso retorno', async () => {
    central(403, { sucesso: false, erro: 'senha_temporaria', token: 'tok/en' })
    const res = await entrar(
      { usuario: '100', senha: 's', lembrar: true, destino: '/alertas' },
      { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'contratos.intranet' },
    )
    const corpo = await res.json()
    expect(corpo.acao).toBe('trocar_senha')
    const url = new URL(corpo.url)
    expect(url.pathname).toBe('/redefinir-senha/tok%2Fen')
    expect(url.searchParams.get('retorno')).toBe('https://contratos.intranet/api/auth/retorno-senha')
    expect(res.cookies.get('cj_sessao')).toBeUndefined()
    const pendente = verificar<{ lembrar: boolean; destino: string; exp: number }>(res.cookies.get('cj_troca_senha')!.value, SEGREDO)
    expect(pendente).toMatchObject({ lembrar: true, destino: '/alertas' })
  })

  it('chave interna errada (401 "Não autorizado.") é erro de configuração -> 503', async () => {
    central(401, { sucesso: false, erro: 'Não autorizado.' })
    expect((await entrar({ usuario: '100', senha: 's' })).status).toBe(503)
  })

  it('Apps Princesa fora do ar -> 503', async () => {
    fetchFalso.mockRejectedValue(new TypeError('fetch failed'))
    const res = await entrar({ usuario: '100', senha: 's' })
    expect(res.status).toBe(503)
    expect((await res.json()).erro).toBe('indisponivel')
  })

  it('campos vazios -> 400 sem chamar a API central', async () => {
    const res = await entrar({ usuario: '  ', senha: '' })
    expect(res.status).toBe(400)
    expect(fetchFalso).not.toHaveBeenCalled()
  })

  it('JSON inválido -> 400', async () => {
    expect((await entrar('isto não é json')).status).toBe(400)
  })

  it('POST vindo de outro site -> 403', async () => {
    const res = await entrar({ usuario: '100', senha: 's' }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(fetchFalso).not.toHaveBeenCalled()
  })
})
