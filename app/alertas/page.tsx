'use client'

import Link from 'next/link'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { SeloStatus } from '@/components/SeloStatus'
import { useAlertas } from '@/lib/api/contratos'
import { formatarData } from '@/lib/shared/status'

/**
 * Fila de alertas: tudo que pede atencao hoje, do mais urgente para o menos.
 *
 * Vencido primeiro (ja passou da data), depois vencimento iminente e prazo de
 * decisao -- o mesmo criterio que o e-mail diario usara para avisar.
 */
export default function Alertas() {
  const { data, isPending, error, refetch } = useAlertas()
  const itens = data?.itens ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Alertas</h1>
        <p className="text-[13px] text-tinta-fraca">
          {data ? `${itens.length} contrato${itens.length === 1 ? '' : 's'} exigindo atenção agora.` : ' '}
        </p>
      </div>

      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />

      <div className="space-y-3">
        {itens.map((c) => (
          <div
            key={c.id}
            className="grad-quadro flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            style={{ '--cor-quadro': c.avaliacao.status === 'vencido' ? 'var(--status-vencido)' : 'var(--status-alerta)' } as React.CSSProperties}
          >
            <div>
              <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                {c.nome}
              </Link>
              <p className="text-[12px] text-tinta-fraca">
                {c.fornecedorNome} · vencimento {formatarData(c.dataFim)} · gestor {c.gestorNome}
              </p>
              {c.avaliacao.decisaoUrgente && (
                <p className="mt-1 text-[12px] text-status-alerta">
                  {c.avaliacao.diasDecisao >= 0
                    ? `⚠️ Faltam ${c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação`
                    : `⚠️ O prazo-limite de manifestação passou há ${-c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === -1 ? '' : 's'}`}
                </p>
              )}
            </div>
            <SeloStatus status={c.avaliacao.status} rotulo={c.avaliacao.rotulo} />
          </div>
        ))}
        {data && itens.length === 0 && (
          <div className="grad-quadro rounded-xl border p-8 text-center text-tinta-fraca" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
            Nenhum alerta ativo no momento.
          </div>
        )}
      </div>
    </div>
  )
}
