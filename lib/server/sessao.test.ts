import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { destinoSeguro, origemConfere, origemPublica } from './sessao'

describe('destinoSeguro', () => {
  it.each([
    ['/contratos/c1?aba=x', '/contratos/c1?aba=x'],
    ['/', '/'],
  ])('aceita caminho interno %s', (valor, esperado) => {
    expect(destinoSeguro(valor)).toBe(esperado)
  })

  it.each([
    '//evil.example/x',
    '/\\evil.example',
    'https://evil.example',
    'contratos',
    '/login',
    '/login?erro=x',
    '/api/auth/sair',
    42,
    undefined,
  ])('recusa %s (vira "/")', (valor) => {
    expect(destinoSeguro(valor)).toBe('/')
  })
})

describe('origemPublica', () => {
  it('usa X-Forwarded-* quando atrás de proxy reverso', () => {
    const req = new NextRequest('http://app:3400/x', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'contratos.intranet' },
    })
    expect(origemPublica(req)).toBe('https://contratos.intranet')
  })

  it('sem proxy, usa a própria requisição', () => {
    expect(origemPublica(new NextRequest('http://localhost:3400/x'))).toBe('http://localhost:3400')
  })
})

describe('origemConfere', () => {
  const comOrigem = (origin?: string) =>
    new NextRequest('http://localhost:3400/api/auth/login', { method: 'POST', headers: origin ? { origin } : {} })

  it('aceita a mesma origem e requisição sem Origin', () => {
    expect(origemConfere(comOrigem('http://localhost:3400'))).toBe(true)
    expect(origemConfere(comOrigem())).toBe(true)
  })

  it('recusa outro site', () => {
    expect(origemConfere(comOrigem('https://evil.example'))).toBe(false)
    expect(origemConfere(comOrigem('lixo'))).toBe(false)
  })
})
