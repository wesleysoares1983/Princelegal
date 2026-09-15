'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { listarContratos } from '@/lib/contratos'
import { formatarData } from '@/lib/status'

/**
 * Todas as obrigacoes de todos os contratos, num lugar so.
 *
 * O detalhe do contrato ja mostra as obrigacoes dele; esta tela existe para
 * quem precisa ver o que esta pendente hoje sem abrir contrato por contrato.
 */
export default function Obrigacoes() {
  const [busca, setBusca] = useState('')
  const [responsavel, setResponsavel] = useState('todos')
  const [vigenciaDe, setVigenciaDe] = useState('')
  const [vigenciaAte, setVigenciaAte] = useState('')

  const linhas = useMemo(
    () =>
      listarContratos().flatMap((c) =>
        c.obrigacoes.map((o) => ({ contrato: c, obrigacao: o })),
      ),
    [],
  )

  const responsaveis = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.obrigacao.responsavel))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  )

  const filtradas = linhas.filter(({ contrato, obrigacao }) => {
    const alvo = `${contrato.nome} ${obrigacao.descricao}`.toLowerCase()
    const passaBusca = alvo.includes(busca.toLowerCase())
    const passaResponsavel = responsavel === 'todos' || obrigacao.responsavel === responsavel
    // Vigencia do CONTRATO (nao da obrigacao): mostra a obrigacao se o periodo
    // do contrato cruza com o intervalo escolhido.
    const passaVigenciaDe = !vigenciaDe || contrato.dataFim >= vigenciaDe
    const passaVigenciaAte = !vigenciaAte || contrato.dataInicio <= vigenciaAte
    return passaBusca && passaResponsavel && passaVigenciaDe && passaVigenciaAte
  })

  const pendentes = filtradas.filter((l) => !l.obrigacao.cumprida)
  const cumpridas = filtradas.filter((l) => l.obrigacao.cumprida)
  const ordenadas = [...pendentes, ...cumpridas]

  const filtrosAtivos = busca || responsavel !== 'todos' || vigenciaDe || vigenciaAte
  function limparFiltros() {
    setBusca('')
    setResponsavel('todos')
    setVigenciaDe('')
    setVigenciaAte('')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Obrigações</h1>
        <p className="text-[13px] text-tinta-fraca">
          {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'} de {filtradas.length}
          {filtrosAtivos ? ' filtradas' : ' no total'}.
        </p>
      </div>

      <div
        className="grad-quadro flex flex-wrap items-end gap-3 rounded-xl border p-3"
        style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Buscar</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do contrato ou da obrigação…"
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Responsável</span>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
          >
            <option value="todos">Todos</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Vigência de</span>
          <input
            type="date"
            value={vigenciaDe}
            onChange={(e) => setVigenciaDe(e.target.value)}
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">até</span>
          <input
            type="date"
            value={vigenciaAte}
            onChange={(e) => setVigenciaAte(e.target.value)}
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
          />
        </label>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={limparFiltros}
            className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div
        className="grad-quadro overflow-hidden rounded-xl border"
        style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}
      >
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-tinta-fraca">
              <th className="px-4 py-2 font-medium">Contrato</th>
              <th className="px-4 py-2 font-medium">Obrigação</th>
              <th className="px-4 py-2 font-medium">Responsável</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Recorrência</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map(({ contrato, obrigacao }) => (
              <tr key={obrigacao.id} className="border-t border-borda hover:bg-painel-2">
                <td className="px-4 py-2">
                  <Link href={`/contratos/${contrato.id}`} className="font-medium text-tinta hover:text-marca">
                    {contrato.nome}
                  </Link>
                </td>
                <td className="px-4 py-2 text-tinta-fraca">{obrigacao.descricao}</td>
                <td className="px-4 py-2 text-tinta-fraca">{obrigacao.responsavel}</td>
                <td className="px-4 py-2 text-tinta-fraca">{formatarData(obrigacao.data)}</td>
                <td className="px-4 py-2 text-tinta-fraca">{obrigacao.recorrencia}</td>
                <td className="px-4 py-2">
                  <span className={obrigacao.cumprida ? 'text-status-vigente' : 'text-status-atencao'}>
                    {obrigacao.cumprida ? '✓ Cumprida' : '● Pendente'}
                  </span>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-tinta-fraca">
                  Nenhuma obrigação encontrada com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
