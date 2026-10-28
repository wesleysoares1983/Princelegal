'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { useUsuario } from '@/components/ProvedorUsuario'
import { ErroDaApi } from '@/lib/api/cliente'
import { useContratos } from '@/lib/api/contratos'
import { useCriarTarefa, useMoverTarefa, useRemoverTarefa, useTarefas, type DadosTarefaTela } from '@/lib/api/tarefas'
import { formatarData } from '@/lib/shared/status'
import { COLUNAS_TAREFA, LIMITE_CONCLUIDAS_PADRAO, type ColunaTarefa, type Tarefa } from '@/lib/shared/tarefas'
import { podeCadastrar } from '@/lib/usuario'

/**
 * Quadro de tarefas e atividades do jurídico (docs/TASKS_IMPLEMENTATION_PLAN.md §6.2).
 *
 * Três colunas; o cartão nasce na coluna cujo "+" abriu o formulário e é
 * arrastado livremente entre elas. Excluir pede justificativa. Tudo vai para
 * a Auditoria geral. Somente leitura vê o quadro, sem "+", arrastar ou excluir.
 */

type Formulario = Omit<DadosTarefaTela, 'coluna'> & { contratoRotulo: string }
const FORM_VAZIO: Formulario = { titulo: '', descricao: '', responsavel: '', prazo: '', contratoId: '', contratoRotulo: '' }

const classeInput =
  'w-full rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const QUADRO_COLUNA: Record<ColunaTarefa, string> = {
  'A fazer': '--status-atencao',
  'Em andamento': '--status-renovado',
  Concluída: '--status-vigente',
}

const corQuadro = (variavel: string) => ({ '--cor-quadro': `var(${variavel})` }) as React.CSSProperties
const mensagem = (e: unknown) => (e instanceof ErroDaApi ? (Object.values(e.campos)[0] ?? e.message) : 'Erro inesperado. Tente novamente.')

/** Campo de texto com sugestões num dropdown próprio -- o <datalist> nativo
 *  não segue o tema escuro do app, então a lista é desenhada à mão aqui. */
function CampoComSugestoes({
  texto,
  onTexto,
  opcoes,
  onEscolher,
  placeholder,
}: {
  texto: string
  onTexto: (v: string) => void
  opcoes: { chave: string; rotulo: string }[]
  onEscolher: (chave: string) => void
  placeholder: string
}) {
  const [aberto, setAberto] = useState(false)
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={texto}
        onChange={(e) => {
          onTexto(e.target.value)
          setAberto(true)
        }}
        onFocus={() => setAberto(true)}
        onMouseDown={() => {
          // Clicar com o campo ja em foco (e a lista aberta) fecha a lista,
          // em vez de so reabrir -- onFocus nao dispara de novo nesse caso.
          if (document.activeElement === inputRef.current) setAberto((atual) => !atual)
        }}
        onBlur={() => {
          // Atraso para o clique numa sugestao chegar antes de a lista fechar.
          blurTimeout.current = setTimeout(() => setAberto(false), 120)
        }}
        placeholder={placeholder}
        className={classeInput}
      />
      {aberto && opcoes.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-borda bg-painel shadow-lg">
          {opcoes.map((o) => (
            <button
              key={o.chave}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurTimeout.current) clearTimeout(blurTimeout.current)
                onEscolher(o.chave)
                setAberto(false)
              }}
              className="block w-full truncate px-2.5 py-1.5 text-left text-[12px] text-tinta hover:bg-painel-2"
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Responsável: texto livre, com os usuários do app e os nomes já usados como sugestão. */
function CampoResponsavel({ valor, onChange, sugestoes }: { valor: string; onChange: (v: string) => void; sugestoes: string[] }) {
  const termo = valor.trim().toLowerCase()
  const filtradas = sugestoes.filter((s) => s.toLowerCase().includes(termo)).slice(0, 50)
  return (
    <CampoComSugestoes
      texto={valor}
      onTexto={onChange}
      opcoes={filtradas.map((nome) => ({ chave: nome, rotulo: nome }))}
      onEscolher={onChange}
      placeholder="Responsável (opcional)"
    />
  )
}

/** Vínculo com contrato: busca na API (só os contratos que o usuário vê). */
function CampoContrato({
  contratoId,
  rotulo,
  onChange,
}: {
  contratoId: string
  rotulo: string
  onChange: (id: string, rotulo: string) => void
}) {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])
  const { data } = useContratos({ busca: buscaAplicada || undefined, porPagina: 10 })

  if (contratoId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta">
        <span className="truncate">📎 {rotulo}</span>
        <button
          type="button"
          onClick={() => onChange('', '')}
          title="Remover vínculo"
          aria-label="Remover vínculo com contrato"
          className="shrink-0 text-[11px] text-tinta-fraca hover:text-tinta"
        >
          ✕
        </button>
      </div>
    )
  }

  const opcoes = (data?.itens ?? []).map((c) => ({ chave: c.id, rotulo: `${c.codigo} — ${c.nome}` }))
  return (
    <CampoComSugestoes
      texto={busca}
      onTexto={setBusca}
      opcoes={opcoes}
      onEscolher={(id) => {
        onChange(id, opcoes.find((o) => o.chave === id)?.rotulo ?? '')
        setBusca('')
      }}
      placeholder="Vincular a um contrato (opcional)"
    />
  )
}

function ChipContrato({ t }: { t: Tarefa }) {
  if (t.vinculoRestrito) {
    return (
      <span className="inline-block rounded-md bg-painel-2 px-2 py-0.5 text-[11px] text-tinta-fraca" title="Vinculada a um contrato de acesso restrito">
        🔒 Contrato restrito
      </span>
    )
  }
  if (!t.contrato) return null
  return (
    <Link
      href={`/contratos/${t.contrato.id}`}
      title={t.contrato.nome}
      className="inline-flex items-center gap-1.5 rounded-md bg-painel-2 px-2 py-0.5 text-[11px] text-marca hover:underline"
    >
      📎 {t.contrato.codigo}
      {t.contrato.encerrado && <span className="text-[10px] uppercase tracking-[0.04em] text-tinta-fraca">encerrado</span>}
    </Link>
  )
}

export default function Tarefas() {
  const escreve = podeCadastrar(useUsuario())
  const { data, isPending, error, refetch } = useTarefas()
  const criar = useCriarTarefa()
  const mover = useMoverTarefa()
  const remover = useRemoverTarefa()

  const [novaTarefaColuna, setNovaTarefaColuna] = useState<ColunaTarefa | null>(null)
  const [novaTarefa, setNovaTarefa] = useState(FORM_VAZIO)
  const [errosForm, setErrosForm] = useState<Record<string, string>>({})
  const [erroForm, setErroForm] = useState('')
  const [cartaoArrastado, setCartaoArrastado] = useState<string | null>(null)
  const [colunaAlvo, setColunaAlvo] = useState<ColunaTarefa | null>(null)
  const [erroMover, setErroMover] = useState('')
  const [tarefaParaExcluir, setTarefaParaExcluir] = useState<Tarefa | null>(null)
  const [justificativaExclusao, setJustificativaExclusao] = useState('')
  const [erroExclusao, setErroExclusao] = useState('')

  const tarefas = data?.itens ?? []

  function abrirNovaTarefa(coluna: ColunaTarefa) {
    setNovaTarefaColuna(coluna)
    setNovaTarefa(FORM_VAZIO)
    setErrosForm({})
    setErroForm('')
  }

  async function criarTarefa(coluna: ColunaTarefa) {
    if (!novaTarefa.titulo.trim()) return
    setErrosForm({})
    setErroForm('')
    const { contratoRotulo: _rotulo, ...dados } = novaTarefa
    try {
      await criar.mutateAsync({ ...dados, coluna })
      setNovaTarefaColuna(null)
    } catch (e) {
      if (e instanceof ErroDaApi && Object.keys(e.campos).length) setErrosForm(e.campos)
      else setErroForm(mensagem(e))
    }
  }

  function moverTarefa(id: string, coluna: ColunaTarefa) {
    // Soltar na mesma coluna não muda nada: nem chama a API.
    if (tarefas.find((t) => t.id === id)?.coluna === coluna) return
    setErroMover('')
    mover.mutate({ id, coluna }, { onError: (e) => setErroMover(mensagem(e)) })
  }

  function fecharExclusao() {
    setTarefaParaExcluir(null)
    setJustificativaExclusao('')
    setErroExclusao('')
  }

  async function confirmarExclusao() {
    if (!tarefaParaExcluir || !justificativaExclusao.trim()) return
    setErroExclusao('')
    try {
      await remover.mutateAsync({ id: tarefaParaExcluir.id, justificativa: justificativaExclusao.trim() })
      fecharExclusao()
    } catch (e) {
      setErroExclusao(mensagem(e))
    }
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
          {!escreve && ' Seu acesso é somente leitura.'}
        </p>
      </div>

      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {resumo.map(({ coluna, total }) => (
              <div key={coluna} className="grad-quadro rounded-xl border p-4" style={corQuadro(QUADRO_COLUNA[coluna])}>
                <p className="text-[11px] uppercase tracking-[0.06em] text-tinta-fraca">{coluna}</p>
                <p className="mt-2 text-2xl font-bold text-tinta">
                  {total}
                  {coluna === 'Concluída' && data.maisConcluidas && '+'}
                </p>
              </div>
            ))}
          </div>

          {erroMover && (
            <p role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-status-vencido/40 bg-painel px-3 py-2 text-[12px] text-status-vencido">
              Não foi possível mover o cartão: {erroMover}
              <button type="button" onClick={() => setErroMover('')} aria-label="Fechar aviso" className="text-[11px] hover:underline">
                ✕
              </button>
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {COLUNAS_TAREFA.map((coluna) => {
              const cartoes = tarefas.filter((t) => t.coluna === coluna)
              return (
                <div
                  key={coluna}
                  onDragOver={(e) => {
                    if (!cartaoArrastado) return
                    e.preventDefault()
                    setColunaAlvo(coluna)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setColunaAlvo(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (cartaoArrastado) moverTarefa(cartaoArrastado, coluna)
                    setCartaoArrastado(null)
                    setColunaAlvo(null)
                  }}
                  className={`grad-quadro flex flex-col gap-2 rounded-xl border p-3 transition-shadow ${colunaAlvo === coluna ? 'ring-2 ring-marca/50' : ''}`}
                  style={corQuadro(QUADRO_COLUNA[coluna])}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">
                      {coluna} <span className="text-tinta-fraca/70">({cartoes.length})</span>
                    </p>
                    {escreve && (
                      <button
                        type="button"
                        onClick={() => abrirNovaTarefa(coluna)}
                        className="rounded-md px-1.5 py-0.5 text-[14px] font-semibold text-tinta-fraca hover:bg-painel hover:text-tinta"
                        title={`Novo cartão em ${coluna}`}
                        aria-label={`Novo cartão em ${coluna}`}
                      >
                        +
                      </button>
                    )}
                  </div>

                  {novaTarefaColuna === coluna && (
                    <div className="grad-quadro space-y-2 rounded-lg border p-3" style={corQuadro(QUADRO_COLUNA[coluna])}>
                      <div>
                        <input
                          autoFocus
                          value={novaTarefa.titulo}
                          onChange={(e) => setNovaTarefa((t) => ({ ...t, titulo: e.target.value }))}
                          placeholder="Título da tarefa"
                          maxLength={200}
                          className={classeInput}
                        />
                        {errosForm.titulo && <p className="mt-1 text-[11px] text-status-vencido">{errosForm.titulo}</p>}
                      </div>
                      <div>
                        <textarea
                          value={novaTarefa.descricao}
                          onChange={(e) => setNovaTarefa((t) => ({ ...t, descricao: e.target.value }))}
                          placeholder="Descrição (opcional)"
                          rows={3}
                          className={`${classeInput} resize-none`}
                        />
                        {errosForm.descricao && <p className="mt-1 text-[11px] text-status-vencido">{errosForm.descricao}</p>}
                      </div>
                      <div>
                        <CampoResponsavel
                          valor={novaTarefa.responsavel}
                          onChange={(v) => setNovaTarefa((t) => ({ ...t, responsavel: v }))}
                          sugestoes={data.facetas.responsaveis}
                        />
                        {errosForm.responsavel && <p className="mt-1 text-[11px] text-status-vencido">{errosForm.responsavel}</p>}
                      </div>
                      <div>
                        <input
                          type="date"
                          value={novaTarefa.prazo}
                          onChange={(e) => setNovaTarefa((t) => ({ ...t, prazo: e.target.value }))}
                          aria-label="Prazo"
                          className={classeInput}
                        />
                        {errosForm.prazo && <p className="mt-1 text-[11px] text-status-vencido">{errosForm.prazo}</p>}
                      </div>
                      <div>
                        <CampoContrato
                          contratoId={novaTarefa.contratoId}
                          rotulo={novaTarefa.contratoRotulo}
                          onChange={(id, rotulo) => setNovaTarefa((t) => ({ ...t, contratoId: id, contratoRotulo: rotulo }))}
                        />
                        {errosForm.contratoId && <p className="mt-1 text-[11px] text-status-vencido">{errosForm.contratoId}</p>}
                      </div>
                      {erroForm && <p className="text-[11px] text-status-vencido">{erroForm}</p>}
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
                          disabled={!novaTarefa.titulo.trim() || criar.isPending}
                          onClick={() => criarTarefa(coluna)}
                          className="rounded-md bg-marca px-2.5 py-1 text-[11px] font-semibold text-marca-tinta hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {criar.isPending ? 'Adicionando…' : 'Adicionar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {cartoes.map((t) => (
                    <div
                      key={t.id}
                      draggable={escreve}
                      onDragStart={() => setCartaoArrastado(t.id)}
                      onDragEnd={() => {
                        setCartaoArrastado(null)
                        setColunaAlvo(null)
                      }}
                      className={`grad-quadro space-y-1.5 rounded-lg border p-3 shadow-sm ${escreve ? 'cursor-grab active:cursor-grabbing' : ''} ${
                        cartaoArrastado === t.id ? 'opacity-50' : ''
                      }`}
                      style={corQuadro(QUADRO_COLUNA[coluna])}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-tinta">{t.titulo}</p>
                        {escreve && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              setTarefaParaExcluir(t)
                              setJustificativaExclusao('')
                              setErroExclusao('')
                            }}
                            title="Excluir tarefa"
                            aria-label="Excluir tarefa"
                            className="shrink-0 text-[11px] text-tinta-fraca hover:text-status-vencido"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {t.descricao && <p className="whitespace-pre-line text-[12px] text-tinta-fraca">{t.descricao}</p>}
                      {(t.responsavel || t.prazo) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-fraca">
                          {t.responsavel && <span>👤 {t.responsavel}</span>}
                          {t.prazo && <span>📅 {formatarData(t.prazo)}</span>}
                        </div>
                      )}
                      <ChipContrato t={t} />
                    </div>
                  ))}

                  {cartoes.length === 0 && novaTarefaColuna !== coluna && (
                    <p className="rounded-lg border border-dashed border-borda px-3 py-4 text-center text-[11px] text-tinta-fraca">Nenhum cartão</p>
                  )}

                  {coluna === 'Concluída' && data.maisConcluidas && (
                    <p className="text-center text-[11px] text-tinta-fraca">Mostrando as {LIMITE_CONCLUIDAS_PADRAO} concluídas mais recentes.</p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tarefaParaExcluir && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="grad-quadro w-full max-w-md space-y-3 rounded-xl border p-5" style={corQuadro('--status-vencido')}>
            <p className="text-[13px] font-semibold text-tinta">Excluir tarefa</p>
            <p className="text-[12px] text-tinta-fraca">
              Tem certeza que deseja excluir <span className="font-semibold text-tinta">“{tarefaParaExcluir.titulo}”</span>? A justificativa fica registrada na
              Auditoria.
            </p>
            <label className="block">
              <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Justificativa</span>
              <textarea
                autoFocus
                value={justificativaExclusao}
                onChange={(e) => setJustificativaExclusao(e.target.value)}
                placeholder="Explique o motivo da exclusão…"
                rows={3}
                maxLength={500}
                className={`mt-1 ${classeInput} resize-none`}
              />
            </label>
            {erroExclusao && <p className="text-[11px] text-status-vencido">{erroExclusao}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={fecharExclusao}
                className="rounded-md border border-borda px-3 py-1.5 text-[12px] text-tinta-fraca hover:text-tinta"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!justificativaExclusao.trim() || remover.isPending}
                onClick={confirmarExclusao}
                className="rounded-md bg-status-vencido px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {remover.isPending ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
