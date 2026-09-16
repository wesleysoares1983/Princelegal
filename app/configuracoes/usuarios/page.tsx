'use client'

import { useState } from 'react'

type NivelUsuario = 'admin' | 'user'

interface Usuario {
  id: string
  nome: string
  sobrenome: string
  email: string
  telefone: string
  nivel: NivelUsuario
}

const USUARIOS_INICIAIS: Usuario[] = [
  { id: 'u1', nome: 'Ana', sobrenome: 'Ribeiro', email: 'ana.ribeiro@princesadoscampos.com.br', telefone: '(42) 99101-2233', nivel: 'admin' },
  { id: 'u2', nome: 'João', sobrenome: 'Silva', email: 'joao.silva@princesadoscampos.com.br', telefone: '(42) 99202-3344', nivel: 'user' },
  { id: 'u3', nome: 'Maria', sobrenome: 'Fernandes', email: 'maria.fernandes@princesadoscampos.com.br', telefone: '(42) 99303-4455', nivel: 'user' },
]

const ROTULO_NIVEL: Record<NivelUsuario, string> = { admin: 'Admin', user: 'Usuário' }

/** Selo do nível: admin em destaque (acesso total), usuário em tom neutro. */
function SeloNivel({ nivel }: { nivel: NivelUsuario }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] ${
        nivel === 'admin'
          ? 'border-marca/40 bg-marca-fraca text-marca'
          : 'border-borda bg-painel-2 text-tinta-fraca'
      }`}
    >
      {ROTULO_NIVEL[nivel]}
    </span>
  )
}

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

type FormUsuario = Omit<Usuario, 'id'>

const FORM_VAZIO: FormUsuario = { nome: '', sobrenome: '', email: '', telefone: '', nivel: 'user' }

export default function CadastroDeUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>(USUARIOS_INICIAIS)
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [nivel, setNivel] = useState<NivelUsuario>('user')
  const [erro, setErro] = useState('')

  // Edição em linha: nenhum usuário editando é `null`; enquanto um estiver,
  // a linha dele troca de texto para os mesmos campos do formulário de cima.
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<FormUsuario>(FORM_VAZIO)
  const [erroEdicao, setErroEdicao] = useState('')

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
      { id: crypto.randomUUID(), nome: nome.trim(), sobrenome: sobrenome.trim(), email: email.trim(), telefone, nivel },
    ])
    setNome('')
    setSobrenome('')
    setEmail('')
    setTelefone('')
    setNivel('user')
  }

  function remover(id: string) {
    setUsuarios((atual) => atual.filter((u) => u.id !== id))
    if (editandoId === id) cancelarEdicao()
  }

  function iniciarEdicao(u: Usuario) {
    setEditandoId(u.id)
    setEdicao({ nome: u.nome, sobrenome: u.sobrenome, email: u.email, telefone: u.telefone, nivel: u.nivel })
    setErroEdicao('')
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setEdicao(FORM_VAZIO)
    setErroEdicao('')
  }

  function salvarEdicao(id: string) {
    const emailJaExiste = usuarios.some(
      (u) => u.id !== id && u.email.toLowerCase() === edicao.email.trim().toLowerCase(),
    )
    if (emailJaExiste) {
      setErroEdicao('Já existe um usuário cadastrado com esse e-mail.')
      return
    }
    setUsuarios((atual) =>
      atual.map((u) =>
        u.id === id
          ? { ...u, nome: edicao.nome.trim(), sobrenome: edicao.sobrenome.trim(), email: edicao.email.trim(), telefone: edicao.telefone, nivel: edicao.nivel }
          : u,
      ),
    )
    cancelarEdicao()
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
            <Campo label="Nível de acesso">
              <select
                required
                value={nivel}
                onChange={(e) => setNivel(e.target.value as NivelUsuario)}
                className={classeInput}
              >
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
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
              <th className="px-4 py-2 font-medium">Nível</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) =>
              editandoId === u.id ? (
                <tr key={u.id} className="border-t border-borda bg-painel-2/60">
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      <input
                        value={edicao.nome}
                        onChange={(e) => setEdicao((d) => ({ ...d, nome: e.target.value }))}
                        placeholder="Nome"
                        className={`${classeInput} py-1.5`}
                      />
                      <input
                        value={edicao.sobrenome}
                        onChange={(e) => setEdicao((d) => ({ ...d, sobrenome: e.target.value }))}
                        placeholder="Sobrenome"
                        className={`${classeInput} py-1.5`}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="email"
                      value={edicao.email}
                      onChange={(e) => setEdicao((d) => ({ ...d, email: e.target.value }))}
                      className={`${classeInput} py-1.5`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={edicao.telefone}
                      onChange={(e) => setEdicao((d) => ({ ...d, telefone: mascararTelefone(e.target.value) }))}
                      className={`${classeInput} py-1.5`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={edicao.nivel}
                      onChange={(e) => setEdicao((d) => ({ ...d, nivel: e.target.value as NivelUsuario }))}
                      className={`${classeInput} py-1.5`}
                    >
                      <option value="user">Usuário</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => salvarEdicao(u.id)}
                        className="text-[11px] font-semibold text-marca hover:underline"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={cancelarEdicao}
                        className="text-[11px] text-tinta-fraca hover:underline"
                      >
                        Cancelar
                      </button>
                    </div>
                    {erroEdicao && <p className="mt-1 text-[10px] text-status-vencido">{erroEdicao}</p>}
                  </td>
                </tr>
              ) : (
                <tr key={u.id} className="border-t border-borda hover:bg-painel-2">
                  <td className="px-4 py-2 font-medium text-tinta">{u.nome} {u.sobrenome}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{u.email}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{u.telefone}</td>
                  <td className="px-4 py-2">
                    <SeloNivel nivel={u.nivel} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(u)}
                        className="text-[11px] font-semibold text-tinta-fraca hover:text-tinta hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(u.id)}
                        className="text-[11px] text-status-vencido hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-tinta-fraca">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
