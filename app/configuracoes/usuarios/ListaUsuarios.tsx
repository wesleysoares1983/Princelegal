'use client'

import { useMemo, useState } from 'react'
import { nivelDoCargo } from '@/lib/usuario'

interface Usuario {
  matricula: string
  nome: string
  email: string
  perfil: string | null
  cargo: string | null
  ativo: boolean
}

type Situacao = 'ativos' | 'inativos' | 'todos'
/** Valor do filtro de cargo para "sem cargo" (cargo nulo). */
const SEM_CARGO = '__sem_cargo__'

const classeInput =
  'rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

/**
 * Selo do cargo: so "ADMIN" vira administrador; o resto (inclusive cargos
 * que este app nao conhece) entra como usuario comum -- e o selo diz isso,
 * para quem ve um cargo estranho na lista entender o efeito dele aqui.
 */
function SeloCargo({ cargo }: { cargo: string | null }) {
  const admin = nivelDoCargo(cargo) === 'admin'
  const reconhecido = cargo === 'ADMIN' || cargo === 'USUARIO'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${
          admin ? 'border-marca/40 bg-marca-fraca text-marca' : 'border-borda bg-painel-2 text-tinta-fraca'
        }`}
      >
        {admin ? 'Admin' : 'Usuário'}
      </span>
      {!reconhecido && (
        <span className="text-[10px] text-tinta-fraca" title="Cargo não reconhecido por este sistema: tratado como usuário comum.">
          {cargo ? `cargo “${cargo}”` : 'sem cargo'}
        </span>
      )}
    </span>
  )
}

export function ListaUsuarios({ usuarios, cargos }: { usuarios: Usuario[]; cargos: string[] }) {
  const [busca, setBusca] = useState('')
  const [cargo, setCargo] = useState('todos')
  const [situacao, setSituacao] = useState<Situacao>('ativos')

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return usuarios
      .filter((u) => (situacao === 'todos' ? true : situacao === 'ativos' ? u.ativo : !u.ativo))
      .filter((u) => (cargo === 'todos' ? true : cargo === SEM_CARGO ? u.cargo === null : u.cargo === cargo))
      .filter((u) => !termo || `${u.nome} ${u.matricula} ${u.email} ${u.perfil ?? ''}`.toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [usuarios, busca, cargo, situacao])

  const totalAdmins = usuarios.filter((u) => u.ativo && nivelDoCargo(u.cargo) === 'admin').length

  return (
    <section className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-3 border-b border-borda px-4 py-3">
        <h2 className="mr-auto text-[13px] font-semibold text-tinta">
          Usuários com acesso <span className="text-tinta-fraca">({filtrados.length} de {usuarios.length} · {totalAdmins} admin{totalAdmins === 1 ? '' : 's'} ativo{totalAdmins === 1 ? '' : 's'})</span>
        </h2>
        <input
          className={`${classeInput} w-56 py-1.5`}
          placeholder="Nome, matrícula, e-mail ou perfil…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar usuário"
        />
        <select className={`${classeInput} py-1.5`} value={cargo} onChange={(e) => setCargo(e.target.value)} aria-label="Filtrar por cargo">
          <option value="todos">Todos os cargos</option>
          {cargos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={SEM_CARGO}>Sem cargo</option>
        </select>
        <select
          className={`${classeInput} py-1.5`}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as Situacao)}
          aria-label="Filtrar por situação"
        >
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-tinta-fraca">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Matrícula</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Perfil</th>
              <th className="px-4 py-2 font-medium">Nível</th>
              <th className="px-4 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => (
              <tr key={u.matricula} className="border-t border-borda hover:bg-painel-2">
                <td className="px-4 py-2 font-medium text-tinta">{u.nome}</td>
                <td className="px-4 py-2 font-mono text-tinta-fraca">{u.matricula}</td>
                <td className="px-4 py-2 text-tinta-fraca">{u.email}</td>
                <td className="px-4 py-2 text-tinta-fraca">{u.perfil ?? '—'}</td>
                <td className="px-4 py-2">
                  <SeloCargo cargo={u.cargo} />
                </td>
                <td className={`px-4 py-2 ${u.ativo ? 'text-status-vigente' : 'text-status-vencido'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-tinta-fraca">
                  {usuarios.length === 0 ? 'Nenhum usuário com acesso a este sistema.' : 'Nenhum usuário encontrado com esses filtros.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
