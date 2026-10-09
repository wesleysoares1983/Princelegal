import { describe, expect, it } from 'vitest'
import { somarDias } from './datas'
import { avaliar, dataLimiteAviso, formatarMoeda, proximoReajuste, type EntradaAvaliacao } from './status'

const HOJE = '2026-10-07'

const contrato = (dados: Partial<EntradaAvaliacao>): EntradaAvaliacao => ({
  dataFim: '2027-12-31',
  prazoAvisoCancelamentoDias: 30,
  encerradoEm: null,
  motivoEncerramento: null,
  ...dados,
})
const fimEm = (dias: number) => somarDias(HOJE, dias)

describe('avaliar — limites de status', () => {
  it.each([
    [-1, 'vencido'],
    [0, 'alerta'],
    [1, 'alerta'],
    [30, 'alerta'],
    [31, 'atencao'],
    [90, 'atencao'],
    [91, 'vigente'],
  ])('vence em %i dia(s) -> %s', (dias, status) => {
    expect(avaliar(contrato({ dataFim: fimEm(dias) }), HOJE).status).toBe(status)
  })

  it('encerrado vence qualquer conta de data', () => {
    expect(avaliar(contrato({ dataFim: fimEm(200), encerradoEm: '2026-09-01', motivoEncerramento: 'manual' }), HOJE).status).toBe(
      'encerrado',
    )
  })

  it('renovado (encerrado por renovação) mostra o sucessor', () => {
    const av = avaliar(
      contrato({ encerradoEm: '2026-09-01', motivoEncerramento: 'renovado', renovadoPorCodigo: 'CTR-2026-000042' }),
      HOJE,
    )
    expect(av).toMatchObject({ status: 'renovado', rotulo: 'Renovado por CTR-2026-000042', decisaoUrgente: false })
  })

  it('rótulos no singular e no plural', () => {
    expect(avaliar(contrato({ dataFim: fimEm(-1) }), HOJE).rotulo).toBe('Fora da vigência há 1 dia')
    expect(avaliar(contrato({ dataFim: fimEm(1) }), HOJE).rotulo).toBe('Vence em 1 dia')
    expect(avaliar(contrato({ dataFim: fimEm(45) }), HOJE).rotulo).toBe('Vence em 45 dias')
  })

  it('decisão urgente: prazo de aviso a 30 dias ou menos, contrato ainda vigente', () => {
    const av = avaliar(contrato({ dataFim: fimEm(60), prazoAvisoCancelamentoDias: 30 }), HOJE)
    expect(av.diasDecisao).toBe(30)
    expect(av.decisaoUrgente).toBe(true)
    expect(avaliar(contrato({ dataFim: fimEm(61), prazoAvisoCancelamentoDias: 30 }), HOJE).decisaoUrgente).toBe(false)
    // Prazo de aviso já passou, contrato ainda vigente: continua urgente.
    expect(avaliar(contrato({ dataFim: fimEm(10), prazoAvisoCancelamentoDias: 90 }), HOJE).decisaoUrgente).toBe(true)
    // Vencido ou no dia do vencimento: não é mais "decisão", é vencimento.
    expect(avaliar(contrato({ dataFim: fimEm(0) }), HOJE).decisaoUrgente).toBe(false)
    expect(avaliar(contrato({ dataFim: fimEm(-5) }), HOJE).decisaoUrgente).toBe(false)
  })
})

describe('dataLimiteAviso', () => {
  it('término menos o prazo de aviso', () => {
    expect(dataLimiteAviso('2026-12-31', 90)).toBe('2026-10-02')
    expect(dataLimiteAviso('2026-12-31', 0)).toBe('2026-12-31')
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

describe('formatarMoeda', () => {
  it('centavos só quando existem', () => {
    expect(formatarMoeda(25000).replace(/\s/g, ' ')).toBe('R$ 25.000')
    expect(formatarMoeda(25000.5).replace(/\s/g, ' ')).toBe('R$ 25.000,50')
  })
})
