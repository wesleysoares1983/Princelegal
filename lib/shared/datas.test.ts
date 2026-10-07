import { describe, expect, it } from 'vitest'
import { diasAte, diasEntre, ehDataIso, hojeSP, somarAnos, somarDias, somarMeses } from './datas'

describe('hojeSP', () => {
  it('usa o dia de Brasília, não o UTC, entre 21h e meia-noite', () => {
    // 07/10 23:30 em Brasília = 08/10 02:30 UTC
    expect(hojeSP(new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07')
  })

  it('vira o dia à meia-noite de Brasília', () => {
    expect(hojeSP(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-08')
    expect(hojeSP(new Date('2026-10-08T02:59:59Z'))).toBe('2026-10-07')
  })

  it('vira o ano corretamente', () => {
    expect(hojeSP(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
  })
})

describe('diasEntre / diasAte', () => {
  it('conta dias corridos, negativo quando já passou', () => {
    expect(diasEntre('2026-10-07', '2026-10-07')).toBe(0)
    expect(diasEntre('2026-10-07', '2026-11-06')).toBe(30)
    expect(diasEntre('2026-10-07', '2026-10-06')).toBe(-1)
    expect(diasAte('2026-12-31', '2026-10-07')).toBe(85)
  })

  it('atravessa ano bissexto', () => {
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2)
    expect(diasEntre('2027-02-28', '2027-03-01')).toBe(1)
  })
})

describe('somarMeses', () => {
  it('ajusta ao fim de meses curtos e volta ao dia original com a âncora', () => {
    const fev = somarMeses('2026-01-31', 1, 31)
    expect(fev).toBe('2026-02-28')
    expect(somarMeses(fev, 1, 31)).toBe('2026-03-31')
  })

  it('sem âncora, mantém o dia da própria data', () => {
    expect(somarMeses('2026-02-28', 1)).toBe('2026-03-28')
  })

  it('atravessa o ano e aceita meses negativos', () => {
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15')
    expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15')
  })

  it('29/02 vira 28/02 em ano comum e volta a 29/02 em bissexto', () => {
    expect(somarAnos('2028-02-29', 1, 29)).toBe('2029-02-28')
    expect(somarAnos('2028-02-29', 4, 29)).toBe('2032-02-29')
  })
})

describe('somarDias / ehDataIso', () => {
  it('soma dias atravessando mês', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('só aceita datas que existem', () => {
    expect(ehDataIso('2026-02-28')).toBe(true)
    expect(ehDataIso('2026-02-30')).toBe(false)
    expect(ehDataIso('2026-2-3')).toBe(false)
    expect(ehDataIso(20261007)).toBe(false)
  })
})
