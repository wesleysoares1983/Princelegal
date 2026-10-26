import { describe, expect, it } from 'vitest'
import { esquemaCriarTarefa, esquemaListarTarefas, esquemaMoverTarefa, esquemaRemoverTarefa } from './tarefas'

const ID = '0b6f8c1e-6a1f-4c7e-9d2a-3f5b8e7c1a20'

describe('esquemaCriarTarefa', () => {
  it('só o título é obrigatório; opcionais vazios viram null', () => {
    expect(esquemaCriarTarefa.parse({ titulo: '  Revisar minuta  ', descricao: '', responsavel: '   ', prazo: '', contratoId: '', coluna: 'A fazer' })).toEqual({
      titulo: 'Revisar minuta',
      descricao: null,
      responsavel: null,
      prazo: null,
      contratoId: null,
      coluna: 'A fazer',
    })
    expect(esquemaCriarTarefa.parse({ titulo: 'X', coluna: 'Concluída' })).toMatchObject({ descricao: null, prazo: null, contratoId: null })
  })

  it('título em branco ou longo demais é recusado, com mensagem no campo', () => {
    const vazio = esquemaCriarTarefa.safeParse({ titulo: '   ', coluna: 'A fazer' })
    expect(vazio.success).toBe(false)
    expect(vazio.error?.issues[0]).toMatchObject({ path: ['titulo'], message: 'Informe o título.' })
    expect(esquemaCriarTarefa.safeParse({ titulo: 'a'.repeat(201), coluna: 'A fazer' }).success).toBe(false)
    expect(esquemaCriarTarefa.safeParse({ titulo: 'a'.repeat(200), coluna: 'A fazer' }).success).toBe(true)
  })

  it('prazo, coluna e contrato inválidos são recusados', () => {
    expect(esquemaCriarTarefa.safeParse({ titulo: 'X', coluna: 'A fazer', prazo: '31/12/2026' }).success).toBe(false)
    expect(esquemaCriarTarefa.safeParse({ titulo: 'X', coluna: 'A fazer', prazo: '2026-02-30' }).success).toBe(false)
    expect(esquemaCriarTarefa.safeParse({ titulo: 'X', coluna: 'Feito' }).success).toBe(false)
    expect(esquemaCriarTarefa.safeParse({ titulo: 'X', coluna: 'A fazer', contratoId: 'abc' }).success).toBe(false)
    expect(esquemaCriarTarefa.parse({ titulo: 'X', coluna: 'A fazer', prazo: '2026-12-31', contratoId: ID })).toMatchObject({ prazo: '2026-12-31', contratoId: ID })
  })
})

describe('mover, remover, listar', () => {
  it('mover aceita só as três colunas', () => {
    expect(esquemaMoverTarefa.parse({ coluna: 'Em andamento' })).toEqual({ coluna: 'Em andamento' })
    expect(esquemaMoverTarefa.safeParse({ coluna: 'em andamento' }).success).toBe(false)
  })

  it('remover exige justificativa de pelo menos 3 caracteres', () => {
    expect(esquemaRemoverTarefa.safeParse({ justificativa: ' ok ' }).success).toBe(false)
    expect(esquemaRemoverTarefa.parse({ justificativa: '  Duplicada  ' })).toEqual({ justificativa: 'Duplicada' })
  })

  it('limite de concluídas: padrão 100, entre 1 e 500', () => {
    expect(esquemaListarTarefas.parse({})).toEqual({ limiteConcluidas: 100 })
    expect(esquemaListarTarefas.parse({ limiteConcluidas: '20' })).toEqual({ limiteConcluidas: 20 })
    expect(esquemaListarTarefas.safeParse({ limiteConcluidas: '0' }).success).toBe(false)
    expect(esquemaListarTarefas.safeParse({ limiteConcluidas: '501' }).success).toBe(false)
  })
})
