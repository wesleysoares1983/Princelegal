'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { SeloStatus } from '@/components/SeloStatus'
import { useContratos } from '@/lib/api/contratos'
import { FILTROS_STATUS, type FiltroStatus } from '@/lib/shared/contratos'
import { formatarData, formatarMoeda } from '@/lib/shared/status'

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

const POR_PAGINA = 50

export default function ListaContratos() {
  return (
    <Suspense fallback={null}>
      <ConteudoListaContratos />
    </Suspense>
  )
}

/**
 * Lista de contratos. Filtros, busca e página ficam na URL (o Início manda
 * `?status=vencido` etc.; voltar do detalhe preserva o filtro). Filtrar,
 * buscar e paginar acontece no servidor -- inclusive o status, calculado lá.
 */
function ConteudoListaContratos() {
  const params = useSearchParams()
  const router = useRouter()
  const caminho = usePathname()

  const statusUrl = params.get('status') as FiltroStatus | null
  const filtro: FiltroStatus = statusUrl && (FILTROS_STATUS as readonly string[]).includes(statusUrl) ? statusUrl : 'todos'
  const somenteRenovacao = params.get('renovacao') === 'sim'
  const buscaUrl = params.get('busca') ?? ''
  const pagina = Math.max(1, Number(params.get('pagina')) || 1)

  // Busca: digita livre, vai para a URL (e para a API) 300 ms depois de parar.
  const [busca, setBusca] = useState(buscaUrl)
  useEffect(() => setBusca(buscaUrl), [buscaUrl])

  function navegar(mudancas: Record<string, string | null>) {
    const nova = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === '') nova.delete(k)
      else nova.set(k, v)
    }
    if (!('pagina' in mudancas)) nova.delete('pagina') // filtro novo volta a pagina 1
    const s = nova.toString()
    router.replace(s ? `${caminho}?${s}` : caminho, { scroll: false })
  }

  useEffect(() => {
    if (busca === buscaUrl) return
    const t = setTimeout(() => navegar({ busca: busca.trim() || null }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const { data, isPending, error, refetch, isFetching } = useContratos({
    status: filtro,
    renovacaoAutomatica: somenteRenovacao ? 'sim' : undefined,
    busca: buscaUrl || undefined,
    pagina,
    porPagina: POR_PAGINA,
  })

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / POR_PAGINA)) : 1

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-tinta">Contratos</h1>
          <p className="text-[13px] text-tinta-fraca">
            {data ? `${data.total} contrato${data.total === 1 ? '' : 's'}${filtro !== 'todos' || buscaUrl || somenteRenovacao ? ' com estes filtros' : ' cadastrados'}.` : ' '}
          </p>
        </div>
        <Link href="/contratos/novo" className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90">
          + Novo contrato
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => navegar({ status: f.valor === 'todos' ? null : f.valor })}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              filtro === f.valor ? 'border-marca/50 bg-marca-fraca text-marca' : 'border-borda text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
            }`}
          >
            {f.rotulo}
          </button>
        ))}
        <button
          onClick={() => navegar({ renovacao: somenteRenovacao ? null : 'sim' })}
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
          placeholder="Buscar por nome, código, razão social, CNPJ ou área…"
          aria-label="Buscar contratos"
          className="ml-auto w-80 max-w-full rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
        />
      </div>

      <div
        className={`grad-quadro overflow-hidden rounded-xl border transition-opacity ${isFetching && data ? 'opacity-70' : ''}`}
        style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
      >
        <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
        {data && (
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
                {data.itens.map((c) => (
                  <tr key={c.id} className="border-t border-borda hover:bg-painel-2">
                    <td className="px-4 py-2 font-mono text-[11px] text-tinta-fraca">{c.codigo}</td>
                    <td className="px-4 py-2">
                      <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                        {c.nome}
                      </Link>
                      {c.acessoRestrito && (
                        <span className="ml-1.5 text-[10px]" title="Acesso restrito">
                          🔒
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.fornecedorNome}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.categoria}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.areaResponsavel}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{formatarData(c.dataFim)}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{formatarMoeda(c.valorMensal)}</td>
                    <td className="px-4 py-2">
                      <SeloStatus status={c.avaliacao.status} rotulo={c.avaliacao.rotulo} />
                    </td>
                  </tr>
                ))}
                {data.itens.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-tinta-fraca">
                      Nenhum contrato encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && totalPaginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-[12px] text-tinta-fraca">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => navegar({ pagina: String(pagina - 1) })}
            className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => navegar({ pagina: String(pagina + 1) })}
            className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
