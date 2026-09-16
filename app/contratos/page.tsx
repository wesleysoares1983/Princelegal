'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { SeloStatus } from '@/components/SeloStatus'
import { listarContratos } from '@/lib/contratos'
import { avaliarContrato, formatarData, formatarMoeda } from '@/lib/status'
import type { Status } from '@/lib/tipos'

type FiltroStatus = Status | 'todos' | 'ativos'

const FILTROS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'vigente', rotulo: 'Vigentes' },
  { valor: 'atencao', rotulo: 'Próx. vencimento' },
  { valor: 'alerta', rotulo: 'Vencimento iminente' },
  { valor: 'vencido', rotulo: 'Vencidos' },
  { valor: 'renovado', rotulo: 'Renovados' },
  { valor: 'encerrado', rotulo: 'Encerrados' },
]

export default function ListaContratos() {
  return (
    <Suspense fallback={null}>
      <ConteudoListaContratos />
    </Suspense>
  )
}

function ConteudoListaContratos() {
  // O Início manda o filtro pela URL (ex.: /contratos?status=vencido) -- os
  // cards do dashboard sao links de verdade, e nao so um atalho visual.
  const params = useSearchParams()
  const statusUrl = params.get('status') as FiltroStatus | null
  const [filtro, setFiltro] = useState<FiltroStatus>(
    statusUrl && FILTROS.some((f) => f.valor === statusUrl) ? statusUrl : 'todos',
  )
  const [somenteRenovacao, setSomenteRenovacao] = useState(params.get('renovacao') === 'sim')
  const [busca, setBusca] = useState('')

  const avaliados = useMemo(
    () => listarContratos().map((c) => ({ c, av: avaliarContrato(c) })),
    [],
  )

  const filtrados = avaliados.filter(({ c, av }) => {
    const passaStatus =
      filtro === 'todos' || (filtro === 'ativos' ? av.status !== 'encerrado' : av.status === filtro)
    const passaRenovacao = !somenteRenovacao || c.renovacaoAutomatica
    const alvo = `${c.nome} ${c.codigo} ${c.fornecedorNome} ${c.areaResponsavel}`.toLowerCase()
    const passaBusca = alvo.includes(busca.toLowerCase())
    return passaStatus && passaRenovacao && passaBusca
  })

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Contratos</h1>
          <p className="text-[13px] text-tinta-fraca">{avaliados.length} contratos cadastrados.</p>
        </div>
        <Link
          href="/contratos/novo"
          className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
        >
          + Novo contrato
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              filtro === f.valor
                ? 'border-marca/50 bg-marca-fraca text-marca'
                : 'border-borda text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
        <button
          onClick={() => setSomenteRenovacao((v) => !v)}
          className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
            somenteRenovacao
              ? 'border-status-renovado/50 bg-status-renovado-fraca text-status-renovado'
              : 'border-borda text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
          }`}
        >
          🔵 Renovação automática
        </button>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, código, razão social ou área…"
          className="ml-auto w-72 max-w-full rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
        />
      </div>

      <div className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Código</th>
                <th className="px-4 py-2 font-medium">Contrato</th>
                <th className="px-4 py-2 font-medium">Razão Social</th>
                <th className="px-4 py-2 font-medium">Categoria</th>
                <th className="px-4 py-2 font-medium">Área</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Valor mensal</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(({ c, av }) => (
                <tr key={c.id} className="border-t border-borda hover:bg-painel-2">
                  <td className="px-4 py-2 font-mono text-[11px] text-tinta-fraca">{c.codigo}</td>
                  <td className="px-4 py-2">
                    <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-tinta-fraca">{c.fornecedorNome}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{c.categoria}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{c.areaResponsavel}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{formatarData(c.dataFim)}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{formatarMoeda(c.valorMensal)}</td>
                  <td className="px-4 py-2">
                    <SeloStatus status={av.status} rotulo={av.rotulo} />
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-tinta-fraca">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
