'use client'

import Link from 'next/link'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { SeloStatus } from '@/components/SeloStatus'
import { usePainel } from '@/lib/api/contratos'
import { formatarData, formatarMoeda } from '@/lib/shared/status'

/** Início: os números da carteira (só contratos que o usuário pode ver). */
export default function Inicio() {
  const { data, isPending, error, refetch } = usePainel()

  const n = data?.contagens
  const cards = [
    { rotulo: 'Contratos ativos', valor: n?.ativos, cor: 'text-tinta', quadro: '--marca', href: '/contratos?status=ativos' },
    { rotulo: 'Vencem em 90 dias', valor: n?.vence90, cor: 'text-status-atencao', quadro: '--status-atencao', href: '/contratos?status=atencao' },
    { rotulo: 'Vencem em 30 dias', valor: n?.vence30, cor: 'text-status-alerta', quadro: '--status-alerta', href: '/contratos?status=alerta' },
    { rotulo: 'Vencidos', valor: n?.vencidos, cor: 'text-status-vencido', quadro: '--status-vencido', href: '/contratos?status=vencido' },
    { rotulo: 'Renovação automática', valor: n?.renovacaoAutomatica, cor: 'text-status-renovado', quadro: '--status-renovado', href: '/contratos?renovacao=sim' },
    {
      rotulo: 'Valor anual contratado',
      valor: data ? formatarMoeda(data.valorAnualAtivos) : undefined,
      cor: 'text-marca',
      quadro: '--marca',
      href: '/contratos?status=ativos',
    },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Início</h1>
        <p className="text-[13px] text-tinta-fraca">Visão geral da carteira de contratos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.rotulo}
            href={card.href}
            className="grad-quadro rounded-xl border p-4 transition-transform hover:-translate-y-0.5 hover:brightness-110"
            style={{ '--cor-quadro': `var(${card.quadro})` } as React.CSSProperties}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-tinta-fraca">{card.rotulo}</p>
            <p className={`mt-2 text-2xl font-bold ${card.cor}`}>{card.valor ?? '—'}</p>
          </Link>
        ))}
      </div>

      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />

      {data && data.decisoesUrgentes.length > 0 && (
        <div className="grad-quadro rounded-xl border p-4" style={{ '--cor-quadro': 'var(--status-alerta)' } as React.CSSProperties}>
          <p className="text-[13px] font-semibold text-status-alerta">
            ⚠️ {data.decisoesUrgentes.length} contrato{data.decisoesUrgentes.length > 1 ? 's' : ''} com prazo de decisão (aviso de
            renovação/cancelamento) se aproximando
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-tinta-fraca">
            {data.decisoesUrgentes.map((c) => (
              <li key={c.id}>
                <Link href={`/contratos/${c.id}`} className="text-tinta hover:text-marca">
                  {c.nome}
                </Link>{' '}
                —{' '}
                {c.avaliacao.diasDecisao >= 0
                  ? `faltam ${c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação`
                  : `prazo-limite de manifestação passou há ${-c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === -1 ? '' : 's'}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <div className="grad-quadro rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
          <div className="flex items-center justify-between border-b border-borda px-4 py-3">
            <h2 className="text-[13px] font-semibold text-tinta">Próximos vencimentos</h2>
            <Link href="/contratos" className="text-[12px] text-marca hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-tinta-fraca">
                  <th className="px-4 py-2 font-medium">Contrato</th>
                  <th className="px-4 py-2 font-medium">Área</th>
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Dias</th>
                  <th className="px-4 py-2 font-medium">Gestor</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.proximosVencimentos.map((c) => (
                  <tr key={c.id} className="border-t border-borda hover:bg-painel-2">
                    <td className="px-4 py-2">
                      <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                        {c.nome}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.areaResponsavel}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{formatarData(c.dataFim)}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.avaliacao.diasVencimento}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.gestorNome}</td>
                    <td className="px-4 py-2">
                      <SeloStatus status={c.avaliacao.status} rotulo={c.avaliacao.rotulo} />
                    </td>
                  </tr>
                ))}
                {data.proximosVencimentos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-tinta-fraca">
                      Nenhum contrato ativo ainda.{' '}
                      <Link href="/contratos/novo" className="text-marca hover:underline">
                        Cadastrar o primeiro
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
