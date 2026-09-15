import Link from 'next/link'
import { SeloStatus } from '@/components/SeloStatus'
import { listarContratos } from '@/lib/contratos'
import { avaliarContrato, formatarData } from '@/lib/status'

/**
 * Fila de alertas: tudo que pede atencao hoje, do mais urgente para o menos.
 *
 * Vencido primeiro (ja passou da data), depois vencimento iminente e prazo de
 * decisao -- o mesmo criterio que o e-mail recorrente usaria para decidir
 * quem escalar.
 */
export default function Alertas() {
  const avaliados = listarContratos()
    .filter((c) => !c.encerradoEm)
    .map((c) => ({ c, av: avaliarContrato(c) }))
    .filter(({ av }) => av.status === 'vencido' || av.status === 'alerta' || av.decisaoUrgente)
    .sort((a, b) => a.av.diasVencimento - b.av.diasVencimento)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Alertas</h1>
        <p className="text-[13px] text-tinta-fraca">
          {avaliados.length} contrato{avaliados.length === 1 ? '' : 's'} exigindo atenção agora.
        </p>
      </div>

      <div className="space-y-3">
        {avaliados.map(({ c, av }) => (
          <div
            key={c.id}
            className="grad-quadro flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            style={{ '--cor-quadro': av.status === 'vencido' ? 'var(--status-vencido)' : 'var(--status-alerta)' } as React.CSSProperties}
          >
            <div>
              <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                {c.nome}
              </Link>
              <p className="text-[12px] text-tinta-fraca">
                {c.fornecedorNome} · vencimento {formatarData(c.dataFim)} · gestor {c.gestor}
              </p>
              {av.decisaoUrgente && (
                <p className="mt-1 text-[12px] text-status-alerta">
                  ⚠️ Faltam {av.diasDecisao} dia{av.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação
                </p>
              )}
            </div>
            <SeloStatus status={av.status} rotulo={av.rotulo} />
          </div>
        ))}
        {avaliados.length === 0 && (
          <div
            className="grad-quadro rounded-xl border p-8 text-center text-tinta-fraca"
            style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
          >
            Nenhum alerta ativo no momento.
          </div>
        )}
      </div>
    </div>
  )
}
