import { describe, expect, it } from 'vitest'
import { nivelDoCargo, podeEscrever } from './usuario'

describe('nivelDoCargo', () => {
  it('só o cargo exatamente "ADMIN" é administrador', () => {
    expect(nivelDoCargo('ADMIN')).toBe('admin')
  })

  it.each(['FUNCIONARIO', 'USUARIO', 'admin', 'Admin', ' ADMIN', 'ADMINISTRADOR', 'Supervisor', '', null, undefined])(
    '%s -> somente leitura',
    (cargo) => {
      expect(nivelDoCargo(cargo)).toBe('leitura')
    },
  )
})

describe('podeEscrever', () => {
  it('só admin escreve; somente leitura e sem sessão, não', () => {
    expect(podeEscrever({ nivel: 'admin' })).toBe(true)
    expect(podeEscrever({ nivel: 'leitura' })).toBe(false)
    expect(podeEscrever(null)).toBe(false)
  })
})
