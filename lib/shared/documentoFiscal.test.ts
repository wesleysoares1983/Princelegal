import { describe, expect, it } from 'vitest'
import { cnpjValido, cpfValido, formatarDocumento, normalizarDocumento, tipoDocumento } from './documentoFiscal'

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('válido: %s', (v) => expect(cpfValido(v)).toBe(true))
  it.each(['529.982.247-24', '111.111.111-11', '1234567890', ''])('inválido: %s', (v) => expect(cpfValido(v)).toBe(false))
})

describe('CNPJ', () => {
  it.each(['11.222.333/0001-81', '04.368.898/0001-06', '11222333000181'])('numérico válido: %s', (v) =>
    expect(cnpjValido(v)).toBe(true),
  )
  // Exemplo oficial da Receita Federal para o CNPJ alfanumérico.
  it.each(['12.ABC.345/01DE-35', '12abc34501de35'])('alfanumérico válido: %s', (v) => expect(cnpjValido(v)).toBe(true))
  it.each(['11.222.333/0001-80', '12.ABC.345/01DE-36', '00.000.000/0000-00', '12.ABC.345/01DE-3A', 'curto'])(
    'inválido: %s',
    (v) => expect(cnpjValido(v)).toBe(false),
  )
})

describe('normalizar / formatar / tipo', () => {
  it('guarda sem pontuação e em maiúsculas', () => {
    expect(normalizarDocumento(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35')
  })
  it('formata CNPJ (inclusive alfanumérico) e CPF', () => {
    expect(formatarDocumento('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25')
  })
  it('identifica o tipo', () => {
    expect(tipoDocumento('529.982.247-25')).toBe('CPF')
    expect(tipoDocumento('12.ABC.345/01DE-35')).toBe('CNPJ')
    expect(tipoDocumento('123')).toBeNull()
  })
})
