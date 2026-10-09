/**
 * CPF e CNPJ do fornecedor: normalizar, validar digitos verificadores, formatar.
 *
 * O CNPJ aceita o formato alfanumerico que a Receita Federal emite desde
 * julho/2026 (IN RFB 2.229/2024): 12 posicoes com letras ou numeros + 2
 * digitos verificadores numericos. O calculo do DV e o mesmo do CNPJ
 * numerico, usando o valor de cada caractere como (codigo ASCII - 48) --
 * o que, para digitos, da o proprio digito. CNPJs so numericos continuam validos.
 *
 * Guardado sem pontuacao e em maiusculas; exibido formatado.
 */

/** Tira pontuacao e espacos; letras em maiusculas. */
export function normalizarDocumento(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

const valorCaractere = (c: string) => c.charCodeAt(0) - 48

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = [...base].reduce((acc, c, i) => acc + valorCaractere(c) * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(valor: string): boolean {
  const d = normalizarDocumento(valor)
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const dv1 = digitoVerificador(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const dv2 = digitoVerificador(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return d.endsWith(`${dv1}${dv2}`)
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function cnpjValido(valor: string): boolean {
  const d = normalizarDocumento(valor)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const dv1 = digitoVerificador(d.slice(0, 12), PESOS_CNPJ_1)
  const dv2 = digitoVerificador(d.slice(0, 13), PESOS_CNPJ_2)
  return d.endsWith(`${dv1}${dv2}`)
}

export type TipoDocumento = 'CPF' | 'CNPJ'

export function tipoDocumento(valor: string): TipoDocumento | null {
  if (cpfValido(valor)) return 'CPF'
  if (cnpjValido(valor)) return 'CNPJ'
  return null
}

/** `12.ABC.345/01DE-35` / `123.456.789-09`; o que nao for CPF/CNPJ volta como veio. */
export function formatarDocumento(valor: string): string {
  const d = normalizarDocumento(valor)
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return valor
}
