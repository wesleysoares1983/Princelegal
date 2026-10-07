import { describe, expect, it } from 'vitest'
import type { Contrato } from '@/lib/tipos'
import { avaliarContrato, proximoReajuste } from './status'

const HOJE = '2026-10-07'

function contrato(dados: Partial<Contrato>): Contrato {
  return {
    id: 'c',
    codigo: 'CTR-2026-000001',
    nome: 'Teste',
    categoria: 'Aluguel',
    fornecedorNome: 'Fornecedor',
    fornecedorDocumento: '00.000.000/0001-00',
    objeto: 'Objeto',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'TI',
    gestor: 'G',
    responsavelJuridico: 'J',
    acessoRestrito: false,
    dataInicio: '2026-01-01',
    dataFim: '2027-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 100,
    formaPagamento: 'Boleto',
    centroCusto: 'CC',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2026-01-01',
    obrigacoes: [],
    documentos: [],
    historico: [],
    auditoria: [],
    ...dados,
  }
}

const fimEm = (dias: number) => {
  const d = new Date(Date.UTC(2026, 9, 7 + dias))
  return d.toISOString().slice(0, 10)
}

describe('avaliarContrato — limites de status', () => {
  it.each([
    [-1, 'vencido'],
    [0, 'alerta'],
    [1, 'alerta'],
    [30, 'alerta'],
    [31, 'atencao'],
    [90, 'atencao'],
    [91, 'vigente'],
  ])('vence em %i dia(s) -> %s', (dias, status) => {
    expect(avaliarContrato(contrato({ dataFim: fimEm(dias) }), HOJE).status).toBe(status)
  })

  it('encerrado vence qualquer conta de data', () => {
    expect(avaliarContrato(contrato({ dataFim: fimEm(200), encerradoEm: '2026-09-01' }), HOJE).status).toBe('encerrado')
  })

  it('rótulo de vencido diz há quantos dias', () => {
    expect(avaliarContrato(contrato({ dataFim: fimEm(-1) }), HOJE).rotulo).toBe('Fora da vigência há 1 dia')
  })

  it('decisão urgente quando o prazo de aviso está a 30 dias ou menos', () => {
    const av = avaliarContrato(contrato({ dataFim: fimEm(60), prazoAvisoCancelamentoDias: 30 }), HOJE)
    expect(av.diasDecisao).toBe(30)
    expect(av.decisaoUrgente).toBe(true)
    expect(avaliarContrato(contrato({ dataFim: fimEm(61), prazoAvisoCancelamentoDias: 30 }), HOJE).decisaoUrgente).toBe(false)
  })
})

describe('proximoReajuste', () => {
  it('aniversário ainda não chegou neste ano -> este ano', () => {
    expect(proximoReajuste('2023-11-01', HOJE)).toBe('2026-11-01')
  })

  it('aniversário já passou -> ano que vem', () => {
    expect(proximoReajuste('2023-10-01', HOJE)).toBe('2027-10-01')
  })

  it('aniversário hoje -> hoje', () => {
    expect(proximoReajuste('2020-10-07', HOJE)).toBe('2026-10-07')
  })

  it('data-base em 29/02 cai em 28/02 em ano comum', () => {
    expect(proximoReajuste('2024-02-29', '2026-01-10')).toBe('2026-02-28')
  })
})
