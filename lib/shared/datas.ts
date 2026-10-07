/**
 * Datas de calendario (vigencia, prazos, obrigacoes) como texto ISO `AAAA-MM-DD`.
 *
 * Sem hora e sem fuso de proposito: "vence em 30/09" e um dia, nao um
 * instante. Toda conta e feita sobre o numero do dia (UTC puro), entao o fuso
 * da maquina nao interfere. O unico ponto que depende de fuso e "que dia e
 * hoje" -- e esse e sempre o de Brasilia (`hojeSP`), nunca o UTC do servidor:
 * entre 21h e meia-noite, o UTC ja esta no dia seguinte.
 *
 * Usado no cliente e no servidor.
 */

const FUSO = 'America/Sao_Paulo'
const MS_DIA = 86_400_000
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data de hoje em Brasilia, `AAAA-MM-DD`. `agora` existe para os testes. */
export function hojeSP(agora: Date = new Date()): string {
  const partes = Object.fromEntries(formatador.formatToParts(agora).map((p) => [p.type, p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

function partes(iso: string): [number, number, number] {
  const m = RE_ISO.exec(iso)
  if (!m) throw new Error(`Data inválida (esperado AAAA-MM-DD): ${iso}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function deDia(dia: number): string {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10)
}

function numeroDoDia(iso: string): number {
  const [a, m, d] = partes(iso)
  return Date.UTC(a, m - 1, d) / MS_DIA
}

/** `AAAA-MM-DD` que existe de verdade (rejeita 2026-02-30). */
export function ehDataIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !RE_ISO.test(valor)) return false
  return deDia(numeroDoDia(valor)) === valor
}

/** Dias corridos de `de` ate `ate` (negativo se `ate` vem antes). */
export function diasEntre(de: string, ate: string): number {
  return numeroDoDia(ate) - numeroDoDia(de)
}

/** Dias corridos entre hoje (Brasilia) e `alvo`. Negativo quando a data ja passou. */
export function diasAte(alvo: string, hoje: string = hojeSP()): number {
  return diasEntre(hoje, alvo)
}

export function somarDias(iso: string, dias: number): string {
  return deDia(numeroDoDia(iso) + dias)
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/**
 * Soma meses mantendo o dia, ajustado ao fim de meses mais curtos.
 *
 * `diaAncora` e o dia original de uma recorrencia: sem ele, 31/01 -> 28/02 ->
 * 28/03 escorregaria; com ele (31), volta a 31/03.
 */
export function somarMeses(iso: string, meses: number, diaAncora?: number): string {
  const [a, m, d] = partes(iso)
  const total = a * 12 + (m - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const dia = Math.min(diaAncora ?? d, ultimoDiaDoMes(ano, mes))
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function somarAnos(iso: string, anos: number, diaAncora?: number): string {
  return somarMeses(iso, anos * 12, diaAncora)
}
