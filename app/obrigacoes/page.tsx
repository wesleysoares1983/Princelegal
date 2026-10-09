'use client'

import { useEffect, useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { LinhaObrigacao } from '@/components/LinhaObrigacao'
import { useObrigacoes } from '@/lib/api/obrigacoes'
import type { SituacaoObrigacao } from '@/lib/shared/obrigacoes'

/**
 * Obrigações de todos os contratos, num lugar só.
 *
 * O detalhe do contrato já mostra as obrigações dele; esta tela existe para
 * quem precisa ver o que está pendente hoje sem abrir contrato por contrato
 * -- e já dar baixa (cumprir) daqui.
 */

const classeCampo =
  'rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const SITUACOES: { valor: SituacaoObrigacao | 'todas'; rotulo: string }[] = [
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'cumprida', rotulo: 'Cumpridas' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
  { valor: 'todas', rotulo: 'Todas' },
]

export default function Obrigacoes() {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [vigenciaDe, setVigenciaDe] = useState('')
  const [vigenciaAte, setVigenciaAte] = useState('')
  const [situacao, setSituacao] = useState<SituacaoObrigacao | 'todas'>('pendente')
  const [atrasadas, setAtrasadas] = useState(false)
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => clearTimeout(t)
  }, [busca])

  const { data, isPending, error, refetch, isFetching } = useObrigacoes({
    busca: buscaAplicada || undefined,
    responsavel: responsavel || undefined,
    vigenciaDe: vigenciaDe || undefined,
    vigenciaAte: vigenciaAte || undefined,
    situacao,
    atrasadas,
    pagina,
  })
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.porPagina)) : 1
  const filtrosAtivos = buscaAplicada || responsavel || vigenciaDe || vigenciaAte || atrasadas || situacao !== 'pendente'
  const mudar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPagina(1)
  }

  function limpar() {
    setBusca('')
    setBuscaAplicada('')
    setResponsavel('')
    setVigenciaDe('')
    setVigenciaAte('')
    setSituacao('pendente')
    setAtrasadas(false)
    setPagina(1)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Obrigações</h1>
        <p className="text-[13px] text-tinta-fraca">Pagamentos, seguros, avisos e demais compromissos dos contratos, por vencimento.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SITUACOES.map((s) => (
          <button
            key={s.valor}
            onClick={() => mudar(setSituacao)(s.valor)}
            className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
              situacao === s.valor ? 'border-marca/50 bg-marca-fraca text-marca' : 'border-borda text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
            }`}
          >
            {s.rotulo}
          </button>
        ))}
        <button
          onClick={() => mudar(setAtrasadas)(!atrasadas)}
          className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
            atrasadas ? 'border-status-vencido/50 bg-status-vencido-fraca text-status-vencido' : 'border-borda text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
          }`}
        >
          Só atrasadas
        </button>
      </div>

      <div className="grad-quadro flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Buscar</span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Contrato ou obrigação…" className={classeCampo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Responsável</span>
          <select value={responsavel} onChange={(e) => mudar(setResponsavel)(e.target.value)} className={classeCampo}>
            <option value="">Todos</option>
            {data?.facetas.responsaveis.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Vigência do contrato — de</span>
          <input type="date" value={vigenciaDe} onChange={(e) => mudar(setVigenciaDe)(e.target.value)} className={classeCampo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">até</span>
          <input type="date" value={vigenciaAte} onChange={(e) => mudar(setVigenciaAte)(e.target.value)} className={classeCampo} />
        </label>
        {filtrosAtivos && (
          <button type="button" onClick={limpar} className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta">
            Limpar filtros
          </button>
        )}
      </div>

      {data && (
        <p className="text-[12px] text-tinta-fraca">
          {data.total} obrigaç{data.total === 1 ? 'ão' : 'ões'}
          {filtrosAtivos ? ' com estes filtros' : ' pendentes'}.
        </p>
      )}

      <div
        className={`grad-quadro overflow-hidden rounded-xl border transition-opacity ${isFetching && data ? 'opacity-70' : ''}`}
        style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}
      >
        <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="text-tinta-fraca">
                  <th className="px-4 py-2 font-medium">Contrato</th>
                  <th className="px-4 py-2 font-medium">Obrigação</th>
                  <th className="px-4 py-2 font-medium">Responsável</th>
                  <th className="px-4 py-2 font-medium">Vencimento</th>
                  <th className="px-4 py-2 font-medium">Recorrência</th>
                  <th className="px-4 py-2 font-medium">Situação</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.itens.map((o) => (
                  <LinhaObrigacao key={o.id} o={o} mostrarContrato />
                ))}
                {data.itens.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-tinta-fraca">
                      Nenhuma obrigação encontrada.
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
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40">
            ← Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="rounded-md border border-borda px-3 py-1.5 hover:text-tinta disabled:opacity-40">
            Próxima →
          </button>
        </div>
      )}
    </div>
  )
}
