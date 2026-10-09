import { diasAte, hojeSP, somarAnos, somarDias } from './datas'

/*
 * Status do contrato: calculado, nunca escolhido a mao nem guardado.
 *
 * Guardar o status deixaria o dado errado no dia seguinte ao vencimento, ate
 * alguem lembrar de mudar. Calculado a cada leitura, a tela de hoje sempre
 * reflete a data de hoje. "Hoje" e sempre a data de Brasilia (`hojeSP`).
 *
 * A MESMA regra existe em SQL (lib/server/db/consultas/status.ts), para
 * filtrar, contar e ordenar no banco; um teste confere que as duas batem.
 */
export { diasAte }

export const STATUS = ['vigente', 'atencao', 'alerta', 'vencido', 'encerrado', 'renovado'] as const
export type Status = (typeof STATUS)[number]

export const LIMIARES_PADRAO = [120, 90, 60, 30, 15, 7] as const

/** O minimo do contrato que o calculo precisa. */
export interface EntradaAvaliacao {
  dataFim: string
  prazoAvisoCancelamentoDias: number
  encerradoEm: string | null
  motivoEncerramento: 'manual' | 'renovado' | null
  /** Codigo do contrato que renovou este, para o rotulo "Renovado por CTR-…". */
  renovadoPorCodigo?: string | null
}

export interface Avaliacao {
  status: Status
  /** Dias até o fim da vigência (negativo se já venceu). */
  diasVencimento: number
  /** Dias até o prazo-limite para avisar cancelamento/renovação (negativo se já passou). */
  diasDecisao: number
  /** Prazo-limite de manifestação a 30 dias ou menos, num contrato ainda vigente. */
  decisaoUrgente: boolean
  rotulo: string
}

const plural = (n: number, palavra: string) => `${n} ${palavra}${n === 1 ? '' : 's'}`

/**
 * A ordem importa: encerrado/renovado (decisão registrada) vencem qualquer
 * conta de data -- um contrato que a empresa já encerrou não volta a aparecer
 * como "vigente" só porque a data final ainda não chegou.
 */
export function avaliar(c: EntradaAvaliacao, hoje: string = hojeSP()): Avaliacao {
  const diasVencimento = diasAte(c.dataFim, hoje)
  const diasDecisao = diasVencimento - c.prazoAvisoCancelamentoDias
  const base = { diasVencimento, diasDecisao }

  if (c.motivoEncerramento === 'renovado') {
    const rotulo = c.renovadoPorCodigo ? `Renovado por ${c.renovadoPorCodigo}` : 'Renovado'
    return { ...base, status: 'renovado', decisaoUrgente: false, rotulo }
  }
  if (c.encerradoEm) {
    return { ...base, status: 'encerrado', decisaoUrgente: false, rotulo: 'Encerrado' }
  }

  const decisaoUrgente = diasVencimento > 0 && diasDecisao <= 30

  if (diasVencimento < 0) {
    return { ...base, status: 'vencido', decisaoUrgente, rotulo: `Fora da vigência há ${plural(-diasVencimento, 'dia')}` }
  }
  if (diasVencimento <= 30) {
    return { ...base, status: 'alerta', decisaoUrgente, rotulo: `Vence em ${plural(diasVencimento, 'dia')}` }
  }
  if (diasVencimento <= 90) {
    return { ...base, status: 'atencao', decisaoUrgente, rotulo: `Vence em ${plural(diasVencimento, 'dia')}` }
  }
  return { ...base, status: 'vigente', decisaoUrgente, rotulo: 'Vigente' }
}

/** Data-limite para avisar cancelamento/renovação: término menos o prazo de aviso. */
export function dataLimiteAviso(dataFim: string, prazoAvisoCancelamentoDias: number): string {
  return somarDias(dataFim, -prazoAvisoCancelamentoDias)
}

export const STATUS_INFO: Record<Status, { rotulo: string; cor: string; corFraca: string; ponto: string }> = {
  vigente: { rotulo: 'Vigente', cor: 'status-vigente', corFraca: 'status-vigente-fraca', ponto: '🟢' },
  atencao: { rotulo: 'Próximo do vencimento', cor: 'status-atencao', corFraca: 'status-atencao-fraca', ponto: '🟡' },
  alerta: { rotulo: 'Vencimento iminente', cor: 'status-alerta', corFraca: 'status-alerta-fraca', ponto: '🟠' },
  vencido: { rotulo: 'Vencido', cor: 'status-vencido', corFraca: 'status-vencido-fraca', ponto: '🔴' },
  encerrado: { rotulo: 'Encerrado', cor: 'status-encerrado', corFraca: 'status-encerrado-fraca', ponto: '⚫' },
  renovado: { rotulo: 'Renovado', cor: 'status-renovado', corFraca: 'status-renovado-fraca', ponto: '🔵' },
}

/**
 * Próximo reajuste: o aniversário da data-base no ano corrente, ou no
 * seguinte se já passou. Data-base em 29/02 cai em 28/02 nos anos comuns.
 */
export function proximoReajuste(dataBaseIso: string, hoje: string = hojeSP()): string {
  const anos = Number(hoje.slice(0, 4)) - Number(dataBaseIso.slice(0, 4))
  const diaAncora = Number(dataBaseIso.slice(8, 10))
  const nesteAno = somarAnos(dataBaseIso, anos, diaAncora)
  return diasAte(nesteAno, hoje) < 0 ? somarAnos(dataBaseIso, anos + 1, diaAncora) : nesteAno
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/** `2026-10-07T13:45:00Z` -> `07/10/2026 10:45` (horário de Brasília). */
export function formatarDataHora(instante: string): string {
  return new Date(instante).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Reais; centavos só aparecem quando existem (R$ 25.000 / R$ 25.000,50). */
export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}
