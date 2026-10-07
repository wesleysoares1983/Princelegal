import { afterEach, describe, expect, it, vi } from 'vitest'
import { validarAmbiente } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('validarAmbiente', () => {
  it('passa com o ambiente completo', () => {
    expect(() => validarAmbiente()).not.toThrow()
  })

  it('lista todas as variáveis com problema de uma vez', () => {
    vi.stubEnv('APP_ID', 'abc')
    vi.stubEnv('SESSION_SECRET', 'curto')
    vi.stubEnv('POSTGRES_HOST', '')
    expect(() => validarAmbiente()).toThrow(/APP_ID[\s\S]*SESSION_SECRET[\s\S]*POSTGRES_HOST/)
  })
})
