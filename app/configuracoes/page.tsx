'use client'

import { useEffect, useState } from 'react'
import { adicionarOpcao, CAMPOS_CADASTRO, lerOpcoes, removerOpcao } from '@/lib/config/opcoesCadastro'

interface Usuario {
  id: string
  nome: string
  sobrenome: string
  email: string
  telefone: string
}

const USUARIOS_INICIAIS: Usuario[] = [
  { id: 'u1', nome: 'Ana', sobrenome: 'Ribeiro', email: 'ana.ribeiro@princesadoscampos.com.br', telefone: '(42) 99101-2233' },
  { id: 'u2', nome: 'João', sobrenome: 'Silva', email: 'joao.silva@princesadoscampos.com.br', telefone: '(42) 99202-3344' },
  { id: 'u3', nome: 'Maria', sobrenome: 'Fernandes', email: 'maria.fernandes@princesadoscampos.com.br', telefone: '(42) 99303-4455' },
]

const classeInput =
  'w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

/** Mascara simples de telefone BR enquanto digita: (00) 00000-0000. */
function mascararTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, '').slice(0, 11)
  if (digitos.length <= 2) return digitos
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`
}

export default function Configuracoes() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(USUARIOS_INICIAIS)
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState('')

  function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    const emailJaExiste = usuarios.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (emailJaExiste) {
      setErro('Já existe um usuário cadastrado com esse e-mail.')
      return
    }
    setErro('')
    setUsuarios((atual) => [
      ...atual,
      { id: crypto.randomUUID(), nome: nome.trim(), sobrenome: sobrenome.trim(), email: email.trim(), telefone },
    ])
    setNome('')
    setSobrenome('')
    setEmail('')
    setTelefone('')
  }

  function remover(id: string) {
    setUsuarios((atual) => atual.filter((u) => u.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Configurações</h1>
        <p className="text-[13px] text-tinta-fraca">Cadastro de usuários com acesso ao sistema.</p>
      </div>

      <section className="grad-quadro rounded-xl border p-5" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <h2 className="mb-4 text-[13px] font-semibold text-tinta">Novo usuário</h2>
        <form onSubmit={cadastrar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome">
              <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Ana" className={classeInput} />
            </Campo>
            <Campo label="Sobrenome">
              <input required value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} placeholder="Ex.: Ribeiro" className={classeInput} />
            </Campo>
            <Campo label="E-mail">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@princesadoscampos.com.br"
                className={classeInput}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                required
                type="tel"
                inputMode="numeric"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                className={classeInput}
              />
            </Campo>
          </div>

          {erro && <p className="text-[12px] text-status-vencido">{erro}</p>}

          <div className="flex justify-end">
            <button type="submit" className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90">
              Cadastrar usuário
            </button>
          </div>
        </form>
      </section>

      <section className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <div className="border-b border-borda px-4 py-3">
          <h2 className="text-[13px] font-semibold text-tinta">
            Usuários cadastrados <span className="text-tinta-fraca">({usuarios.length})</span>
          </h2>
        </div>
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="text-tinta-fraca">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Telefone</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-borda hover:bg-painel-2">
                <td className="px-4 py-2 font-medium text-tinta">{u.nome} {u.sobrenome}</td>
                <td className="px-4 py-2 text-tinta-fraca">{u.email}</td>
                <td className="px-4 py-2 text-tinta-fraca">{u.telefone}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remover(u.id)}
                    className="text-[11px] text-status-vencido hover:underline"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-tinta-fraca">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <ConfigCadastros />
    </div>
  )
}

/* ------------------------- Opções de cadastro ------------------------- */

const ICONE_CAMPO: Record<string, string> = {
  categoria: 'M20.6 12.6L12 21.2 2.8 12 11.4 3.4a2 2 0 011.4-.6H19a2 2 0 012 2v5.2a2 2 0 01-.6 1.4zM16.5 7.5h.01',
  empresa: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  filial: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  'centro-custo': 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  'area-responsavel': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
}

function PainelOpcaoCadastro({ campo }: { campo: { id: string; titulo: string } }) {
  const [, forcar] = useState(0)
  const [novo, setNovo] = useState('')
  const opcoes = lerOpcoes(campo.id)

  useEffect(() => {
    const recarregar = () => forcar((n) => n + 1)
    window.addEventListener('cj:config', recarregar)
    return () => window.removeEventListener('cj:config', recarregar)
  }, [])

  function adicionar() {
    if (!novo.trim()) return
    adicionarOpcao(campo.id, novo)
    setNovo('')
  }

  return (
    <div className="rounded-lg border border-borda bg-painel-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--roxo) 18%, transparent)', color: 'var(--roxo)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONE_CAMPO[campo.id] ?? ICONE_CAMPO.categoria} />
          </svg>
        </span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">{campo.titulo}</p>
        <span className="ml-auto text-[10px] text-tinta-fraca/70">{opcoes.length} opções</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {opcoes.length === 0 && <p className="text-[11px] text-tinta-fraca/70">Nenhuma opção cadastrada ainda.</p>}
        {opcoes.map((o) => (
          <span
            key={o}
            className="flex items-center gap-1.5 rounded-full border border-borda bg-painel py-1 pl-3 pr-1.5 text-[12px] text-tinta"
          >
            {o}
            <button
              type="button"
              onClick={() => removerOpcao(campo.id, o)}
              aria-label={`Remover ${o}`}
              className="grid h-4 w-4 place-items-center rounded-full text-tinta-fraca hover:bg-status-vencido/20 hover:text-status-vencido"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className={classeInput}
          placeholder={`Nova opção de ${campo.titulo.toLowerCase()}`}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta transition-opacity disabled:opacity-40"
          disabled={!novo.trim()}
          onClick={adicionar}
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}

function ConfigCadastros() {
  return (
    <section className="grad-quadro rounded-xl border p-5" style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}>
      <h2 className="text-[13px] font-semibold text-tinta">Opções de cadastro</h2>
      <p className="mb-4 text-[12px] text-tinta-fraca">
        Categoria, Empresa, Filial, Centro de Custo e Área Responsável que aparecem no formulário de
        Novo Contrato.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPOS_CADASTRO.map((campo) => (
          <PainelOpcaoCadastro key={campo.id} campo={campo} />
        ))}
      </div>
    </section>
  )
}
