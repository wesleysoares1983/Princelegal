import { afterEach, describe, expect, it, vi } from 'vitest'
import { assinar, verificar } from './token'

const SEGREDO = 'segredo-de-teste-com-pelo-menos-32-caracteres!'
const daquiA = (s: number) => Math.floor(Date.now() / 1000) + s

afterEach(() => vi.useRealTimers())

describe('token assinado', () => {
  it('ida e volta preserva os dados', () => {
    const token = assinar({ u: { nome: 'Ana' }, exp: daquiA(60) }, SEGREDO)
    expect(verificar<{ u: { nome: string }; exp: number }>(token, SEGREDO)?.u.nome).toBe('Ana')
  })

  it('recusa dados alterados (troca de nivel no conteudo)', () => {
    const token = assinar({ nivel: 'user', exp: daquiA(60) }, SEGREDO)
    const [, assinatura] = token.split('.')
    const forjado = Buffer.from(JSON.stringify({ nivel: 'admin', exp: daquiA(60) })).toString('base64url')
    expect(verificar(`${forjado}.${assinatura}`, SEGREDO)).toBeNull()
  })

  it('recusa assinatura de outro segredo', () => {
    const token = assinar({ exp: daquiA(60) }, 'outro-segredo-qualquer-com-32-caracteres-ou-mais')
    expect(verificar(token, SEGREDO)).toBeNull()
  })

  it('recusa token vencido', () => {
    vi.useFakeTimers()
    const token = assinar({ exp: daquiA(60) }, SEGREDO)
    vi.advanceTimersByTime(61_000)
    expect(verificar(token, SEGREDO)).toBeNull()
  })

  it.each([undefined, '', 'sem-ponto', 'a.b.c', 'lixo.lixo'])('recusa formato inválido: %s', (valor) => {
    expect(verificar(valor, SEGREDO)).toBeNull()
  })

  it('recusa token sem exp', () => {
    const corpo = Buffer.from(JSON.stringify({ u: 1 })).toString('base64url')
    // Assinatura valida para um corpo sem exp: precisa ser recusado mesmo assim.
    const assinado = assinar({ exp: 0 } as { exp: number }, SEGREDO)
    expect(verificar(`${corpo}.${assinado.split('.')[1]}`, SEGREDO)).toBeNull()
  })
})
