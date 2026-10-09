'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { useAuditoria } from '@/lib/api/contratos'
import { formatarDataHora } from '@/lib/shared/status'

/**
 * Trilha de auditoria de todos os contratos, num lugar so.
 *
 * O detalhe do contrato ja mostra a auditoria dele; esta tela responde "quem
 * cadastrou/alterou/encerrou o que" sem abrir contrato por contrato. Cada um
 * ve os eventos dos contratos que pode ver; eventos de configuracao (opcoes
 * de cadastro) aparecem so para administradores.
 */
export default function Auditoria() {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [usuario, setUsuario] = useState('')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => clearTimeout(t)
  }, [busca])

  const { data, isPending, error, refetch, isFetching } = useAuditoria({
    busca: buscaAplicada || undefined,
    usuario: usuario || undefined,
    pagina,
  })
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1
  const filtrosAtivos = buscaAplicada || usuario

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Auditoria</h1>
        <p className="text-[13px] text-tinta-fraca">Quem cadastrou, alterou, encerrou ou reabriu cada contrato — e quando.</p>
      </div>

      <div className="grad-quadro flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Buscar</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Contrato, código ou ação…"
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Usuário</span>
          <select
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value)
              setPagina(1)
            }}
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="sistema">Sistema</option>
            {data?.facetas.usuarios.map((u) => (
              <option key={u.matricula} value={u.matricula}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={() => {
              setBusca('')
              setBuscaAplicada('')
              setUsuario('')
              setPagina(1)
            }}
            className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {data && (
        <p className="text-[12px] text-tinta-fraca">
          {data.total} evento{data.total === 1 ? '' : 's'}
          {filtrosAtivos ? ' com estes filtros' : ''}.
        </p>
      )}

      <div
        className={`grad-quadro overflow-hidden rounded-xl border transition-opacity ${isFetching && data ? 'opacity-70' : ''}`}
        style={{ '--cor-quadro': 'var(--status-encerrado)' } as React.CSSProperties}
      >
        <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
        {data && (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Contrato</th>
                <th className="px-4 py-2 font-medium">Usuário</th>
                <th className="px-4 py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.itens.map((e) => (
                <tr key={e.id} className="border-t border-borda align-top hover:bg-painel-2">
                  <td className="whitespace-nowrap px-4 py-2 text-tinta-fraca">{formatarDataHora(e.ocorridoEm)}</td>
                  <td className="px-4 py-2">
                    {e.contrato ? (
                      <>
                        <Link href={`/contratos/${e.contrato.id}`} className="font-medium text-tinta hover:text-marca">
                          {e.contrato.nome}
                        </Link>
                        <p className="font-mono text-[11px] text-tinta-fraca">{e.contrato.codigo}</p>
                      </>
                    ) : (
                      <span className="text-tinta-fraca">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {e.usuario ? <span className="text-tinta">{e.usuario.nome}</span> : <span className="italic text-tinta-fraca">Sistema</span>}
                  </td>
                  <td className="px-4 py-2 text-tinta-fraca">{e.descricao}</td>
                </tr>
              ))}
              {data.itens.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-tinta-fraca">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && totalPaginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-[12px] text-tinta-fraca">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40">
            ← Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
