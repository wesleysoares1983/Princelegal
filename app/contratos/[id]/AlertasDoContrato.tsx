'use client'

import { useAlertasDoContrato } from '@/lib/api/contratos'
import { formatarData, formatarDataHora } from '@/lib/shared/status'

/** Na aba Vigência: os e-mails de alerta deste contrato (enviados e falhas). */

const DESCRICAO = {
  vencimento: (l: number, ref: string) => `Vencimento (${formatarData(ref)}) — aviso de ${l} dias`,
  prazo_aviso: (l: number, ref: string) => `Prazo de aviso (${formatarData(ref)}) — aviso de ${l} dias`,
  vencido: (_l: number, ref: string) => `Fora da vigência desde ${formatarData(ref)}`,
} as const

export function AlertasDoContrato({ contratoId }: { contratoId: string }) {
  const { data } = useAlertasDoContrato(contratoId, true)
  return (
    <div className="grad-quadro rounded-xl border p-4" style={{ '--cor-quadro': 'var(--status-alerta)' } as React.CSSProperties}>
      <p className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">E-mails de alerta</p>
      {!data?.length ? (
        <p className="mt-1 text-[12px] text-tinta-fraca">
          Nenhum enviado ainda. O gestor e o responsável jurídico recebem e-mail a 120, 90, 60, 30, 15 e 7 dias do vencimento e do prazo de aviso.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-[12px]">
          {data.map((a) => (
            <li key={a.id} className={a.situacao === 'falhou' ? 'text-status-vencido' : 'text-tinta'}>
              {a.situacao === 'falhou' ? '✗' : '✉'} {formatarDataHora(a.enviadoEm)} · {DESCRICAO[a.tipo](a.limiarDias, a.dataReferencia)}
              <span className="text-tinta-fraca"> · {a.situacao === 'falhou' ? `falhou: ${a.erro}` : a.destinatarios.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
