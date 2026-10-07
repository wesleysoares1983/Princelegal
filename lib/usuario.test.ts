import { describe, expect, it } from 'vitest'
import { nivelDoCargo } from './usuario'

describe('nivelDoCargo', () => {
  it('só o cargo exatamente "ADMIN" é administrador', () => {
    expect(nivelDoCargo('ADMIN')).toBe('admin')
  })

  it.each(['USUARIO', 'admin', 'Admin', ' ADMIN', 'ADMINISTRADOR', 'Supervisor', '', null, undefined])(
    '%s -> usuário comum',
    (cargo) => {
      expect(nivelDoCargo(cargo)).toBe('user')
    },
  )
})
