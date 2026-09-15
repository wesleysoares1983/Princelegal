import Link from 'next/link'
import { SeloStatus } from '@/components/SeloStatus'
import { listarContratos } from '@/lib/contratos'
import { avaliarContrato, formatarData, formatarMoeda } from '@/lib/status'

export default function Inicio() {
  const contratos = listarContratos()
  const avaliados = contratos.map((c) => ({ c, av: avaliarContrato(c) }))

  const ativos = avaliados.filter(({ av }) => av.status !== 'encerrado')
  const vence90 = avaliados.filter(({ av }) => av.status === 'atencao')
  const vence30 = avaliados.filter(({ av }) => av.status === 'alerta')
  const vencidos = avaliados.filter(({ av }) => av.status === 'vencido')
  const renovacaoAuto = avaliados.filter(({ c }) => c.renovacaoAutomatica && c.encerradoEm === undefined)
  const decisaoUrgente = avaliados.filter(({ av }) => av.decisaoUrgente && av.status !== 'vencido')
  const valorAnual = ativos.reduce((soma, { c }) => soma + c.valorMensal * 12, 0)

  const cards = [
    { rotulo: 'Contratos ativos', valor: ativos.length, cor: 'text-tinta', quadro: '--marca', href: '/contratos?status=ativos' },
    { rotulo: 'Vencem em 90 dias', valor: vence90.length, cor: 'text-status-atencao', quadro: '--status-atencao', href: '/contratos?status=atencao' },
    { rotulo: 'Vencem em 30 dias', valor: vence30.length, cor: 'text-status-alerta', quadro: '--status-alerta', href: '/contratos?status=alerta' },
    { rotulo: 'Vencidos', valor: vencidos.length, cor: 'text-status-vencido', quadro: '--status-vencido', href: '/contratos?status=vencido' },
    { rotulo: 'Renovação automática', valor: renovacaoAuto.length, cor: 'text-status-renovado', quadro: '--status-renovado', href: '/contratos?renovacao=sim' },
    { rotulo: 'Valor anual contratado', valor: formatarMoeda(valorAnual), cor: 'text-marca', quadro: '--marca', href: '/contratos' },
  ]

  const proximos = avaliados
    .filter(({ av }) => av.status !== 'encerrado' && av.status !== 'renovado')
    .sort((a, b) => a.av.diasVencimento - b.av.diasVencimento)
    .slice(0, 8)

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
            <p className={`mt-2 text-2xl font-bold ${card.cor}`}>{card.valor}</p>
          </Link>
        ))}
      </div>

      {decisaoUrgente.length > 0 && (
        <div className="grad-quadro rounded-xl border p-4" style={{ '--cor-quadro': 'var(--status-alerta)' } as React.CSSProperties}>
          <p className="text-[13px] font-semibold text-status-alerta">
            ⚠️ {decisaoUrgente.length} contrato{decisaoUrgente.length > 1 ? 's' : ''} com prazo de decisão (aviso de renovação/cancelamento) se aproximando
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-tinta-fraca">
            {decisaoUrgente.map(({ c, av }) => (
              <li key={c.id}>
                <Link href={`/contratos/${c.id}`} className="text-tinta hover:text-marca">
                  {c.nome}
                </Link>{' '}
                — faltam {av.diasDecisao} dia{av.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação
              </li>
            ))}
          </ul>
        </div>
      )}

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
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {proximos.map(({ c, av }) => (
                <tr key={c.id} className="border-t border-borda hover:bg-painel-2">
                  <td className="px-4 py-2">
                    <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-tinta-fraca">{c.areaResponsavel}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{formatarData(c.dataFim)}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{av.diasVencimento}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{c.gestor}</td>
                  <td className="px-4 py-2">
                    <SeloStatus status={av.status} rotulo={av.rotulo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
