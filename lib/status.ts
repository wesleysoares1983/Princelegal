import type { Contrato, Status } from './tipos'

/** Dias corridos entre hoje e uma data ISO. Negativo quando a data já passou. */
export function diasAte(dataIso: string, hoje = new Date()): number {
  const alvo = new Date(dataIso + 'T00:00:00')
  const base = new Date(hoje.toISOString().slice(0, 10) + 'T00:00:00')
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000)
}

export const LIMIARES_PADRAO = [120, 90, 60, 30, 15, 7] as const

export interface Avaliacao {
  status: Status
  /** Dias até o fim da vigência (negativo se já venceu). */
  diasVencimento: number
  /** Dias até o prazo-limite para avisar cancelamento/renovação (negativo se já passou). */
  diasDecisao: number
  /** Prazo de decisão é mais urgente que a vigência em si. */
  decisaoUrgente: boolean
  rotulo: string
}

/**
 * Calcula o status do contrato a partir das datas, nunca de um campo salvo.
 *
 * A ordem importa: encerrado/renovado (decisão humana registrada) vencem
 * qualquer conta de data, porque um contrato que a empresa já encerrou não
 * deveria voltar a aparecer como "vigente" só porque a data final ainda não
 * chegou.
 */
export function avaliarContrato(c: Contrato, hoje = new Date()): Avaliacao {
  const diasVencimento = diasAte(c.dataFim, hoje)
  const diasDecisao = diasVencimento - c.prazoAvisoCancelamentoDias
  const decisaoUrgente = diasDecisao <= 30 && diasDecisao >= diasVencimento * -1 && diasVencimento > 0

  if (c.encerradoEm) {
    return { status: 'encerrado', diasVencimento, diasDecisao, decisaoUrgente: false, rotulo: 'Encerrado' }
  }

  const foiRenovado = c.historico.some((h) => h.tipo === 'Renovação' && diasAte(h.dataInicio, hoje) <= 0)
  if (foiRenovado && diasVencimento > 0) {
    return { status: 'renovado', diasVencimento, diasDecisao, decisaoUrgente: false, rotulo: 'Renovado' }
  }

  if (diasVencimento < 0) {
    const diasFora = Math.abs(diasVencimento)
    return {
      status: 'vencido',
      diasVencimento,
      diasDecisao,
      decisaoUrgente: false,
      rotulo: `Fora da vigência há ${diasFora} dia${diasFora === 1 ? '' : 's'}`,
    }
  }

  if (diasVencimento <= 30) {
    return { status: 'alerta', diasVencimento, diasDecisao, decisaoUrgente, rotulo: `Vence em ${diasVencimento} dia${diasVencimento === 1 ? '' : 's'}` }
  }

  if (diasVencimento <= 90) {
    return { status: 'atencao', diasVencimento, diasDecisao, decisaoUrgente, rotulo: `Vence em ${diasVencimento} dias` }
  }

  return { status: 'vigente', diasVencimento, diasDecisao, decisaoUrgente, rotulo: 'Vigente' }
}

export const STATUS_INFO: Record<Status, { rotulo: string; cor: string; corFraca: string; ponto: string }> = {
  vigente: { rotulo: 'Vigente', cor: 'status-vigente', corFraca: 'status-vigente-fraca', ponto: '🟢' },
  atencao: { rotulo: 'Próximo do vencimento', cor: 'status-atencao', corFraca: 'status-atencao-fraca', ponto: '🟡' },
  alerta: { rotulo: 'Vencimento iminente', cor: 'status-alerta', corFraca: 'status-alerta-fraca', ponto: '🟠' },
  vencido: { rotulo: 'Vencido', cor: 'status-vencido', corFraca: 'status-vencido-fraca', ponto: '🔴' },
  renovacao: { rotulo: 'Em renovação', cor: 'status-alerta', corFraca: 'status-alerta-fraca', ponto: '🟠' },
  encerrado: { rotulo: 'Encerrado', cor: 'status-encerrado', corFraca: 'status-encerrado-fraca', ponto: '⚫' },
  renovado: { rotulo: 'Renovado', cor: 'status-renovado', corFraca: 'status-renovado-fraca', ponto: '🔵' },
}

/** Próximo reajuste: mesma data-base, ano seguinte ao mais recente já passado. */
export function proximoReajuste(dataBaseIso: string, hoje = new Date()): string {
  const base = new Date(dataBaseIso + 'T00:00:00')
  const alvo = new Date(base)
  alvo.setFullYear(hoje.getFullYear())
  if (diasAte(alvo.toISOString().slice(0, 10), hoje) < 0) {
    alvo.setFullYear(alvo.getFullYear() + 1)
  }
  return alvo.toISOString().slice(0, 10)
}

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
