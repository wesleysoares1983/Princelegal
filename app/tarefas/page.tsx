'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { listarContratos } from '@/lib/contratos'
import { usuarioAtual } from '@/lib/auth'
import { formatarData } from '@/lib/status'
import {
  adicionarTarefa,
  COLUNAS_TAREFA,
  listarTarefas,
  moverTarefaColuna,
  removerTarefa,
  type ColunaTarefa,
  type Tarefa,
} from '@/lib/tarefas'
import { listarUsuarios, nomeCompleto } from '@/lib/usuarios'

const FORM_VAZIO = { titulo: '', descricao: '', responsavel: '', prazo: '', contratoId: '' }

const classeInput =
  'w-full rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const QUADRO_COLUNA: Record<ColunaTarefa, string> = {
  'A fazer': '--status-atencao',
  'Em andamento': '--status-renovado',
  Concluída: '--status-vigente',
}

/** Campo de texto livre para o responsável, com sugestões dos usuários
 *  cadastrados num dropdown proprio -- o <input list> nativo (datalist) nao
 *  segue o tema escuro do app, entao a lista e desenhada a mao aqui. */
function CampoResponsavel({
  valor,
  onChange,
  sugestoes,
}: {
  valor: string
  onChange: (v: string) => void
  sugestoes: string[]
}) {
  const [aberto, setAberto] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const filtradas = sugestoes.filter((s) => s.toLowerCase().includes(valor.trim().toLowerCase()))

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={valor}
        onChange={(e) => {
          onChange(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onMouseDown={() => {
          // Clicar com o campo ja em foco (e a lista aberta) fecha a lista,
          // em vez de so reabrir -- onFocus nao dispara de novo nesse caso.
          if (document.activeElement === inputRef.current) setAberto((atual) => !atual)
        }}
        onBlur={() => {
          blurTimeout.current = setTimeout(() => setAberto(false), 120)
        }}
        placeholder="Responsável (opcional)"
        className={classeInput}
      />
      {aberto && filtradas.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-borda bg-painel shadow-lg">
          {filtradas.map((nome) => (
            <button
              key={nome}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurTimeout.current) clearTimeout(blurTimeout.current)
                onChange(nome)
                setAberto(false)
              }}
              className="block w-full px-2.5 py-1.5 text-left text-[12px] text-tinta hover:bg-painel-2"
            >
              {nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Tarefas() {
  const contratos = useMemo(() => listarContratos(), [])
  const usuarios = useMemo(() => listarUsuarios(), [])
  const nomesUsuarios = useMemo(() => usuarios.map(nomeCompleto), [usuarios])
  const [tarefas, setTarefas] = useState<Tarefa[]>(() => [...listarTarefas()])
  const [novaTarefaColuna, setNovaTarefaColuna] = useState<ColunaTarefa | null>(null)
  const [novaTarefa, setNovaTarefa] = useState(FORM_VAZIO)
  const [cartaoArrastado, setCartaoArrastado] = useState<string | null>(null)
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<Tarefa | null>(null)
  const [justificativaExclusao, setJustificativaExclusao] = useState('')

  function abrirNovaTarefa(coluna: ColunaTarefa) {
    setNovaTarefaColuna(coluna)
    setNovaTarefa(FORM_VAZIO)
  }

  function criarTarefa(coluna: ColunaTarefa) {
    if (!novaTarefa.titulo.trim()) return
    adicionarTarefa(
      {
        id: `tarefa-${Date.now()}`,
        titulo: novaTarefa.titulo.trim(),
        descricao: novaTarefa.descricao.trim() || undefined,
        responsavel: novaTarefa.responsavel.trim() || undefined,
        prazo: novaTarefa.prazo || undefined,
        contratoId: novaTarefa.contratoId || undefined,
        coluna,
        criadoEm: new Date().toISOString().slice(0, 10),
      },
      usuarioAtual() ?? 'Usuário',
    )
    setTarefas([...listarTarefas()])
    setNovaTarefaColuna(null)
  }

  function moverTarefa(idTarefa: string, coluna: ColunaTarefa) {
    moverTarefaColuna(idTarefa, coluna, usuarioAtual() ?? 'Usuário')
    setTarefas([...listarTarefas()])
  }

  function contratoDaTarefa(t: Tarefa) {
    return t.contratoId ? contratos.find((c) => c.id === t.contratoId) : undefined
  }

  function confirmarExclusao() {
    if (!tarefaParaExcluir || !justificativaExclusao.trim()) return
    removerTarefa(tarefaParaExcluir.id, usuarioAtual() ?? 'Usuário', justificativaExclusao.trim())
    setTarefas([...listarTarefas()])
    setTarefaParaExcluir(null)
    setJustificativaExclusao('')
  }

  const resumo = COLUNAS_TAREFA.map((coluna) => ({
    coluna,
    total: tarefas.filter((t) => t.coluna === coluna).length,
  }))

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Tarefas</h1>
        <p className="text-[13px] text-tinta-fraca">
          Quadro de controle de tarefas e atividades. Pode ficar avulsa ou vinculada a um contrato existente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {resumo.map(({ coluna, total }) => (
          <div
            key={coluna}
            className="grad-quadro rounded-xl border p-4"
            style={{ '--cor-quadro': `var(${QUADRO_COLUNA[coluna]})` } as React.CSSProperties}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-tinta-fraca">{coluna}</p>
            <p className="mt-2 text-2xl font-bold text-tinta">{total}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COLUNAS_TAREFA.map((coluna) => {
          const cartoes = tarefas.filter((t) => t.coluna === coluna)
          return (
            <div
              key={coluna}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (cartaoArrastado) moverTarefa(cartaoArrastado, coluna)
                setCartaoArrastado(null)
              }}
              className="grad-quadro flex flex-col gap-2 rounded-xl border p-3"
              style={{ '--cor-quadro': `var(${QUADRO_COLUNA[coluna]})` } as React.CSSProperties}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">
                  {coluna} <span className="text-tinta-fraca/70">({cartoes.length})</span>
                </p>
                <button
                  type="button"
                  onClick={() => abrirNovaTarefa(coluna)}
                  className="rounded-md px-1.5 py-0.5 text-[14px] font-semibold text-tinta-fraca hover:bg-painel hover:text-tinta"
                  title={`Novo cartão em ${coluna}`}
                >
                  +
                </button>
              </div>

              {novaTarefaColuna === coluna && (
                <div
                  className="grad-quadro space-y-2 rounded-lg border p-3"
                  style={{ '--cor-quadro': `var(${QUADRO_COLUNA[coluna]})` } as React.CSSProperties}
                >
                  <input
                    autoFocus
                    value={novaTarefa.titulo}
                    onChange={(e) => setNovaTarefa((t) => ({ ...t, titulo: e.target.value }))}
                    placeholder="Título da tarefa"
                    className="w-full rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
                  />
                  <textarea
                    value={novaTarefa.descricao}
                    onChange={(e) => setNovaTarefa((t) => ({ ...t, descricao: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    rows={3}
                    className="w-full resize-none rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
                  />
                  <CampoResponsavel
                    valor={novaTarefa.responsavel}
                    onChange={(v) => setNovaTarefa((t) => ({ ...t, responsavel: v }))}
                    sugestoes={nomesUsuarios}
                  />
                  <input
                    type="date"
                    value={novaTarefa.prazo}
                    onChange={(e) => setNovaTarefa((t) => ({ ...t, prazo: e.target.value }))}
                    className="w-full rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
                  />
                  <select
                    value={novaTarefa.contratoId}
                    onChange={(e) => setNovaTarefa((t) => ({ ...t, contratoId: e.target.value }))}
                    className="w-full rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
                  >
                    <option value="">Sem vínculo com contrato</option>
                    {contratos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} — {c.nome}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setNovaTarefaColuna(null)}
                      className="rounded-md border border-borda px-2.5 py-1 text-[11px] text-tinta-fraca hover:text-tinta"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => criarTarefa(coluna)}
                      className="rounded-md bg-marca px-2.5 py-1 text-[11px] font-semibold text-marca-tinta hover:opacity-90"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              )}

              {cartoes.map((t) => {
                const contrato = contratoDaTarefa(t)
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setCartaoArrastado(t.id)}
                    onDragEnd={() => setCartaoArrastado(null)}
                    className="grad-quadro cursor-grab space-y-1.5 rounded-lg border p-3 shadow-sm active:cursor-grabbing"
                    style={{ '--cor-quadro': `var(${QUADRO_COLUNA[coluna]})` } as React.CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-tinta">{t.titulo}</p>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setTarefaParaExcluir(t)
                          setJustificativaExclusao('')
                        }}
                        title="Excluir tarefa"
                        aria-label="Excluir tarefa"
                        className="shrink-0 text-[11px] text-tinta-fraca hover:text-status-vencido"
                      >
                        ✕
                      </button>
                    </div>
                    {t.descricao && <p className="text-[12px] text-tinta-fraca">{t.descricao}</p>}
                    {(t.responsavel || t.prazo) && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-fraca">
                        {t.responsavel && <span>👤 {t.responsavel}</span>}
                        {t.prazo && <span>📅 {formatarData(t.prazo)}</span>}
                      </div>
                    )}
                    {contrato && (
                      <Link
                        href={`/contratos/${contrato.id}`}
                        className="inline-block rounded-md bg-painel-2 px-2 py-0.5 text-[11px] text-marca hover:underline"
                      >
                        📎 {contrato.codigo}
                      </Link>
                    )}
                  </div>
                )
              })}

              {cartoes.length === 0 && novaTarefaColuna !== coluna && (
                <p className="rounded-lg border border-dashed border-borda px-3 py-4 text-center text-[11px] text-tinta-fraca">
                  Nenhum cartão
                </p>
              )}
            </div>
          )
        })}
      </div>

      {tarefaParaExcluir && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div
            className="grad-quadro w-full max-w-md space-y-3 rounded-xl border p-5"
            style={{ '--cor-quadro': 'var(--status-vencido)' } as React.CSSProperties}
          >
            <p className="text-[13px] font-semibold text-tinta">Excluir tarefa</p>
            <p className="text-[12px] text-tinta-fraca">
              Tem certeza que deseja excluir <span className="font-semibold text-tinta">"{tarefaParaExcluir.titulo}"</span>?
              A justificativa fica registrada na Auditoria.
            </p>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Justificativa</span>
              <textarea
                autoFocus
                value={justificativaExclusao}
                onChange={(e) => setJustificativaExclusao(e.target.value)}
                placeholder="Explique o motivo da exclusão…"
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTarefaParaExcluir(null)
                  setJustificativaExclusao('')
                }}
                className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!justificativaExclusao.trim()}
                onClick={confirmarExclusao}
                className="rounded-md bg-status-vencido px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
