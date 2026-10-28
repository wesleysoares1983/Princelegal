import { describe, expect, it } from 'vitest'
import { nivelDoCargo, podeCadastrar, podeEscrever } from './usuario'

describe('nivelDoCargo', () => {
  it('só o cargo exatamente "ADMIN" é administrador', () => {
    expect(nivelDoCargo('ADMIN')).toBe('admin')
  })

  it('só o cargo exatamente "FUNCIONARIO" é funcionário', () => {
    expect(nivelDoCargo('FUNCIONARIO')).toBe('funcionario')
  })

  it.each(['USUARIO', 'funcionario', 'FUNCIONARIO ', 'admin', 'Admin', ' ADMIN', 'ADMINISTRADOR', 'Supervisor', '', null, undefined])(
    '%s -> somente leitura',
    (cargo) => {
      expect(nivelDoCargo(cargo)).toBe('leitura')
    },
  )
})

describe('podeCadastrar / podeEscrever', () => {
  it('admin faz tudo; funcionário só cadastra; somente leitura e sem sessão, nada', () => {
    expect([podeCadastrar({ nivel: 'admin' }), podeEscrever({ nivel: 'admin' })]).toEqual([true, true])
    expect([podeCadastrar({ nivel: 'funcionario' }), podeEscrever({ nivel: 'funcionario' })]).toEqual([true, false])
    expect([podeCadastrar({ nivel: 'leitura' }), podeEscrever({ nivel: 'leitura' })]).toEqual([false, false])
    expect([podeCadastrar(null), podeEscrever(null)]).toEqual([false, false])
  })
})
