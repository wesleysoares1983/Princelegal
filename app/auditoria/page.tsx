'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { listarContratos } from '@/lib/contratos'
import { formatarData } from '@/lib/status'

/**
 * Trilha de auditoria de todos os contratos, num lugar so.
 *
 * O detalhe do contrato ja mostra a auditoria dele; esta tela existe para
 * responder "quem cadastrou/alterou/encerrou o que" sem abrir contrato por
 * contrato -- o uso tipico e uma conferencia do Juridico, nao um acompanhamento
 * de um unico contrato.
 */
export default function Auditoria() {
  const [busca, setBusca] = useState('')
  const [usuario, setUsuario] = useState('todos')

  const eventos = useMemo(
    () =>
      listarContratos()
        .flatMap((c) => c.auditoria.map((e) => ({ contrato: c, evento: e })))
        .sort((a, b) => (a.evento.data < b.evento.data ? 1 : -1)),
    [],
  )

  const usuarios = useMemo(
    () => Array.from(new Set(eventos.map((e) => e.evento.usuario))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [eventos],
  )

  const filtrados = eventos.filter(({ contrato, evento }) => {
    const alvo = `${contrato.nome} ${contrato.codigo} ${evento.acao}`.toLowerCase()
    const passaBusca = alvo.includes(busca.toLowerCase())
    const passaUsuario = usuario === 'todos' || evento.usuario === usuario
    return passaBusca && passaUsuario
  })

  const filtrosAtivos = busca || usuario !== 'todos'

  const contratosComAtividade = new Set(eventos.map((e) => e.contrato.id)).size
  const cartoes = [
    { rotulo: 'Eventos registrados', valor: eventos.length, quadro: '--marca' },
    { rotulo: 'Contratos com atividade', valor: contratosComAtividade, quadro: '--status-renovado' },
    { rotulo: 'Usuários envolvidos', valor: usuarios.length, quadro: '--status-atencao' },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Auditoria</h1>
        <p className="text-[13px] text-tinta-fraca">Quem cadastrou, alterou, anexou documento ou mudou o status de cada contrato.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cartoes.map((c) => (
          <div
            key={c.rotulo}
            className="grad-quadro rounded-xl border p-4"
            style={{ '--cor-quadro': `var(${c.quadro})` } as React.CSSProperties}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-tinta-fraca">{c.rotulo}</p>
            <p className="mt-2 text-2xl font-bold text-tinta">{c.valor}</p>
          </div>
        ))}
      </div>

      <p className="text-[12px] text-tinta-fraca">
        {filtrados.length} evento{filtrados.length === 1 ? '' : 's'}{filtrosAtivos ? ' filtrados' : ' listados'}.
      </p>

      <div
        className="grad-quadro flex flex-wrap items-end gap-3 rounded-xl border p-3"
        style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
      >
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
            onChange={(e) => setUsuario(e.target.value)}
            className="rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
          >
            <option value="todos">Todos</option>
            {usuarios.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>

        {filtrosAtivos && (
          <button
            type="button"
            onClick={() => {
              setBusca('')
              setUsuario('todos')
            }}
            className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div
        className="grad-quadro overflow-hidden rounded-xl border"
        style={{ '--cor-quadro': 'var(--status-encerrado)' } as React.CSSProperties}
      >
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-tinta-fraca">
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Contrato</th>
              <th className="px-4 py-2 font-medium">Usuário</th>
              <th className="px-4 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(({ contrato, evento }) => (
              <tr key={evento.id} className="border-t border-borda hover:bg-painel-2">
                <td className="px-4 py-2 whitespace-nowrap text-tinta-fraca">{formatarData(evento.data)}</td>
                <td className="px-4 py-2">
                  <Link href={`/contratos/${contrato.id}`} className="font-medium text-tinta hover:text-marca">
                    {contrato.nome}
                  </Link>
                  <p className="font-mono text-[11px] text-tinta-fraca">{contrato.codigo}</p>
                </td>
                <td className="px-4 py-2 text-tinta-fraca">
                  <span className={evento.usuario === 'Sistema' ? 'italic text-tinta-fraca' : 'text-tinta'}>{evento.usuario}</span>
                </td>
                <td className="px-4 py-2 text-tinta-fraca">{evento.acao}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-tinta-fraca">
                  Nenhum evento encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
