import { describe, expect, it } from 'vitest'
import { primeiraOcorrenciaDesde, proximaData } from './obrigacoes'

describe('proximaData', () => {
  it('mensal a partir de 31/01: 28/02 → 31/03 (âncora no dia 31)', () => {
    const fev = proximaData('2026-01-31', 'Mensal', 31)!
    expect(fev).toBe('2026-02-28')
    expect(proximaData(fev, 'Mensal', 31)).toBe('2026-03-31')
  })

  it('mensal em ano bissexto: 31/01 → 29/02', () => {
    expect(proximaData('2028-01-31', 'Mensal', 31)).toBe('2028-02-29')
  })

  it('anual em 29/02: 28/02 nos anos comuns, volta a 29/02 no bissexto', () => {
    let d = '2028-02-29'
    const serie = [] as string[]
    for (let i = 0; i < 4; i++) serie.push((d = proximaData(d, 'Anual', 29)!))
    expect(serie).toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('Única e Por evento não geram', () => {
    expect(proximaData('2026-01-10', 'Única', null)).toBeNull()
    expect(proximaData('2026-01-10', 'Por evento', null)).toBeNull()
  })
})

describe('primeiraOcorrenciaDesde', () => {
  it('avança a série até a data pedida (renovação)', () => {
    expect(primeiraOcorrenciaDesde('2026-01-10', 'Mensal', 10, '2026-05-01')).toBe('2026-05-10')
    expect(primeiraOcorrenciaDesde('2026-06-15', 'Mensal', 15, '2026-05-01')).toBe('2026-06-15') // já está depois
    expect(primeiraOcorrenciaDesde('2025-03-31', 'Anual', 31, '2027-01-01')).toBe('2027-03-31')
  })
})
