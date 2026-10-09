import { diasEntre, somarDias } from './datas'
import { LIMIARES_PADRAO } from './status'

/**
 * Regra dos alertas por e-mail (docs/BACKEND_IMPLEMENTATION.md §9.1) -- pura,
 * sem banco nem relógio, para testar cada limite.
 *
 * Para cada contrato aberto, duas contagens com os mesmos limiares
 * (120/90/60/30/15/7 dias):
 * - `vencimento`: até o término;
 * - `prazo_aviso`: até a data-limite para avisar cancelamento/renovação
 *   (só quando o prazo de aviso é maior que zero).
 * E `vencido` uma única vez, no primeiro dia fora da vigência.
 *
 * Entre os limiares já alcançados e ainda não processados, só o mais urgente
 * é enviado; os maiores ficam como `ignorado`. Contrato cadastrado a 20 dias
 * do fim recebe um e-mail "30 dias", não quatro.
 */

export type TipoAlerta = 'vencimento' | 'prazo_aviso' | 'vencido'

export interface ContratoParaAlerta {
  dataFim: string
  prazoAvisoCancelamentoDias: number
}

/** Limiar já processado (enviado ou ignorado) para uma data de referência. */
export interface RegistroAlerta {
  tipo: TipoAlerta
  limiarDias: number
  dataReferencia: string
}

export interface ItemAlerta {
  tipo: TipoAlerta
  limiarDias: number
  dataReferencia: string
  /** Dias até a data de referência (negativo para `vencido`). */
  dias: number
}

export interface PlanoAlerta {
  enviar: ItemAlerta[]
  ignorar: ItemAlerta[]
}

export function planejarAlertas(c: ContratoParaAlerta, processados: RegistroAlerta[], hoje: string): PlanoAlerta {
  const plano: PlanoAlerta = { enviar: [], ignorar: [] }
  const jaFoi = (tipo: TipoAlerta, limiar: number, ref: string) =>
    processados.some((r) => r.tipo === tipo && r.limiarDias === limiar && r.dataReferencia === ref)

  const contagens: { tipo: TipoAlerta; ref: string }[] = [{ tipo: 'vencimento', ref: c.dataFim }]
  if (c.prazoAvisoCancelamentoDias > 0) contagens.push({ tipo: 'prazo_aviso', ref: somarDias(c.dataFim, -c.prazoAvisoCancelamentoDias) })

  for (const { tipo, ref } of contagens) {
    const dias = diasEntre(hoje, ref)
    if (dias < 0) continue
    const pendentes = LIMIARES_PADRAO.filter((l) => dias <= l && !jaFoi(tipo, l, ref)).sort((a, b) => a - b)
    if (!pendentes.length) continue
    const [maisUrgente, ...maiores] = pendentes
    plano.enviar.push({ tipo, limiarDias: maisUrgente, dataReferencia: ref, dias })
    for (const l of maiores) plano.ignorar.push({ tipo, limiarDias: l, dataReferencia: ref, dias })
  }

  const diasFim = diasEntre(hoje, c.dataFim)
  if (diasFim < 0 && !jaFoi('vencido', 0, c.dataFim)) plano.enviar.push({ tipo: 'vencido', limiarDias: 0, dataReferencia: c.dataFim, dias: diasFim })

  return plano
}

/** Frase curta de um item, para assunto e corpo do e-mail. */
export function descreverItem(i: ItemAlerta): string {
  const n = (d: number) => `${d} dia${d === 1 ? '' : 's'}`
  if (i.tipo === 'vencido') return `fora da vigência há ${n(-i.dias)}`
  if (i.tipo === 'vencimento') return i.dias === 0 ? 'vence hoje' : `vence em ${n(i.dias)}`
  return i.dias === 0 ? 'prazo de aviso termina hoje' : `prazo de aviso em ${n(i.dias)}`
}

/** O item mais urgente vai no assunto: vencido > menor número de dias. */
export function maisUrgente(itens: ItemAlerta[]): ItemAlerta {
  return [...itens].sort((a, b) => (a.tipo === 'vencido' ? -1 : b.tipo === 'vencido' ? 1 : a.dias - b.dias))[0]
}
