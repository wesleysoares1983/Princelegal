'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AREAS_RESPONSAVEIS, EMPRESAS, FILIAIS } from '@/lib/contratos'
import { formatarData, formatarMoeda } from '@/lib/status'
import type { Categoria, IndiceReajuste } from '@/lib/tipos'

const CATEGORIAS: Categoria[] = [
  'Aluguel', 'Água', 'Energia', 'Condomínio', 'Telecom', 'Licença', 'Seguro', 'Prestação de Serviço', 'Jurídico', 'Outros',
]
const INDICES: IndiceReajuste[] = ['IPCA', 'IGP-M', 'INPC', 'Fixo', 'Outro']

const PASSOS = [
  { titulo: 'Identificação', descricao: 'Contrato, fornecedor e responsáveis' },
  { titulo: 'Vigência e financeiro', descricao: 'Prazos, valores e reajuste' },
  { titulo: 'Revisar e salvar', descricao: 'Confirme os dados do cadastro' },
] as const

const ICONES: Record<string, string> = {
  tag: 'M20.6 12.6L12 21.2 2.8 12 11.4 3.4a2 2 0 011.4-.6H19a2 2 0 012 2v5.2a2 2 0 01-.6 1.4zM16.5 7.5h.01',
  predio: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  pessoa: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  documento: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h6',
  calendario: 'M8 2v3M16 2v3M3.5 9h17M4 4.5h16a1 1 0 011 1V20a1 1 0 01-1 1H4a1 1 0 01-1-1V5.5a1 1 0 011-1z',
  refresh: 'M20 12a8 8 0 10-3 6.2M20 6v5h-5',
  moeda: 'M12 3v18M8 7h6a3 3 0 010 6H9a3 3 0 000 6h7',
  banco: 'M3 10h18M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18M12 3l9 5H3z',
  pasta: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  indice: 'M4 19V5M4 19h16M8 15l3-4 3 3 4-6',
  clipe: 'M21.4 11.1l-8.7 8.7a5 5 0 01-7.1-7.1l8.7-8.7a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9',
}

const EXTENSOES_ACEITAS = '.pdf,.doc,.docx'
const TIPOS_ACEITOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function Icone({ nome }: { nome: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d={ICONES[nome] ?? ICONES.tag} />
    </svg>
  )
}

/** Cartão de campo no padrão do modal "Nova análise" do Princevision: rótulo com ícone em cima, controle sem moldura própria embaixo. */
function CampoCartao({ label, icone, children }: { label: string; icone: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-borda bg-painel-2/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">
        <span className="text-marca">
          <Icone nome={icone} />
        </span>
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

const classeMini =
  'w-full bg-transparent text-[13px] font-semibold text-tinta placeholder:font-normal placeholder:text-tinta-fraca focus:outline-none'

function SelectMini(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...resto } = props
  return (
    <div className="relative">
      <select {...resto} className={`${classeMini} appearance-none pr-5 ${className}`} />
      <svg width="10" height="10" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-tinta-fraca">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}

interface DadosContrato {
  nome: string
  categoria: string
  empresa: string
  filial: string
  areaResponsavel: string
  fornecedor: string
  documento: string
  gestor: string
  responsavelJuridico: string
  objeto: string
  dataInicio: string
  dataFim: string
  prazoAviso: string
  renovacaoAutomatica: string
  valorMensal: string
  formaPagamento: string
  centroCusto: string
  indiceReajuste: string
  dataBaseReajuste: string
  observacoes: string
}

const VAZIO: DadosContrato = {
  nome: '',
  categoria: '',
  empresa: '',
  filial: '',
  areaResponsavel: '',
  fornecedor: '',
  documento: '',
  gestor: '',
  responsavelJuridico: '',
  objeto: '',
  dataInicio: '',
  dataFim: '',
  prazoAviso: '90',
  renovacaoAutomatica: 'nao',
  valorMensal: '',
  formaPagamento: '',
  centroCusto: '',
  indiceReajuste: '',
  dataBaseReajuste: '',
  observacoes: '',
}

/** Linha do resumo: mostra o dado ou avisa que ficou em branco. */
function LinhaResumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.05em] text-tinta-fraca">{label}</p>
      <p className={`mt-0.5 text-[13px] ${valor ? 'text-tinta' : 'text-tinta-fraca italic'}`}>{valor || 'Não preenchido'}</p>
    </div>
  )
}

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Upload do contrato assinado: PDF ou Word.
 *
 * So guarda o arquivo em memoria -- sem backend nesta versao, "anexar" aqui
 * valida o fluxo (tipo aceito, nome, tamanho) que a tela de Documentos do
 * contrato vai usar quando o upload for de verdade.
 */
function CampoArquivo({
  arquivo,
  erro,
  onSelecionar,
  onRemover,
}: {
  arquivo: File | null
  erro: string
  onSelecionar: (arquivo: File | null) => void
  onRemover: () => void
}) {
  function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const escolhido = e.target.files?.[0] ?? null
    onSelecionar(escolhido)
    e.target.value = ''
  }

  return (
    <div className="rounded-xl border border-borda bg-painel-2/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">
        <span className="text-marca">
          <Icone nome="clipe" />
        </span>
        Contrato assinado (PDF ou Word)
      </div>

      {arquivo ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-tinta">
            {arquivo.name} <span className="font-normal text-tinta-fraca">· {formatarTamanho(arquivo.size)}</span>
          </span>
          <button type="button" onClick={onRemover} className="shrink-0 text-[11px] text-status-vencido hover:underline">
            Remover
          </button>
        </div>
      ) : (
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-tinta-fraca hover:text-tinta">
          <span className="rounded-md border border-borda bg-painel px-2.5 py-1 text-[11px] font-semibold text-tinta">Escolher arquivo</span>
          <span>Nenhum arquivo selecionado</span>
          <input type="file" accept={EXTENSOES_ACEITAS} onChange={aoEscolher} className="hidden" />
        </label>
      )}
      {erro && <p className="mt-1.5 text-[11px] text-status-vencido">{erro}</p>}
    </div>
  )
}

export default function NovoContrato() {
  const [passo, setPasso] = useState(0)
  const [enviado, setEnviado] = useState(false)
  const [dados, setDados] = useState<DadosContrato>(VAZIO)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroArquivo, setErroArquivo] = useState('')

  function selecionarArquivo(escolhido: File | null) {
    if (!escolhido) return
    if (!TIPOS_ACEITOS.includes(escolhido.type) && !/\.(pdf|docx?)$/i.test(escolhido.name)) {
      setErroArquivo('Formato não aceito. Envie um PDF ou um Word (.doc/.docx).')
      return
    }
    setErroArquivo('')
    setArquivo(escolhido)
  }

  const ultimoPasso = passo === PASSOS.length - 1

  function campo<K extends keyof DadosContrato>(chave: K) {
    return {
      value: dados[chave],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setDados((d) => ({ ...d, [chave]: e.target.value })),
    }
  }

  /**
   * Sair da revisão sempre volta ao modo de edição.
   *
   * Sem isto, quem salva e depois volta para corrigir um campo encontra a
   * revisão outra vez em "contrato cadastrado" -- o aviso de sucesso e o
   * resultado de um clique em Salvar, nao de estar na terceira etapa.
   */
  function irPara(i: number) {
    setEnviado(false)
    setPasso(i)
  }
  function avancar() {
    setEnviado(false)
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1))
  }
  function voltar() {
    setEnviado(false)
    setPasso((p) => Math.max(p - 1, 0))
  }

  /**
   * So dispara por clique explicito no botao "Salvar contrato".
   *
   * De proposito nao e o onSubmit de um <form>: um <form> com varios campos
   * pode submeter sozinho com Enter em qualquer input, o que pularia a
   * revisao. Sem `<form>`, nao ha submissao implicita nenhuma para escapar.
   */
  function salvar() {
    // Sem backend nesta versão: o cadastro real entra quando o projeto ganhar
    // uma API. Fica na propria tela apos salvar -- quem decide sair e a
    // pessoa, clicando em "Ver contratos", e nao um redirecionamento automatico.
    setEnviado(true)
  }

  const valorMensalNum = Number(dados.valorMensal.replace(',', '.'))

  return (
    <div className="flex min-h-full items-start justify-center p-6">
      <div
        className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-roxo/30 bg-painel md:grid-cols-[260px_1fr]"
        style={{ boxShadow: '0 30px 80px -20px color-mix(in srgb, var(--roxo) 45%, transparent)' }}
      >
        {/* Lateral: identidade do fluxo e os passos. */}
        <aside className="relative flex flex-col justify-between overflow-hidden border-b border-borda bg-painel-2/40 p-5 md:border-b-0 md:border-r">
          {/* Onda decorativa no rodape da lateral, como no modal de referencia. */}
          <svg
            className="pointer-events-none absolute bottom-0 left-0 w-full text-roxo/25"
            height="90"
            viewBox="0 0 260 90"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d="M-10 60c30-25 60-25 90 0s60 25 90 0 60-25 90 0" stroke="currentColor" strokeWidth="1.4" />
            <path d="M-10 78c30-25 60-25 90 0s60 25 90 0 60-25 90 0" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
          </svg>
          <div className="relative z-10">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-marca text-marca-tinta">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3z" />
                  <path d="M7 20a3 3 0 01-3-3" />
                  <path d="M8 8h7M8 12h7M8 16h4" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-tinta">Novo contrato</p>
                <p className="text-[11px] leading-snug text-tinta-fraca">Cadastre vigência, valores e responsáveis.</p>
              </div>
            </div>

            <ol className="mt-6 space-y-4">
              {PASSOS.map((p, i) => {
                const ativo = i === passo
                const concluido = i < passo
                return (
                  <li key={p.titulo}>
                    <button
                      type="button"
                      onClick={() => irPara(i)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          ativo || concluido
                            ? 'bg-marca text-marca-tinta'
                            : 'border border-borda text-tinta-fraca'
                        }`}
                      >
                        {concluido ? '✓' : i + 1}
                      </span>
                      <span>
                        <p className={`text-[12px] font-semibold ${ativo ? 'text-tinta' : 'text-tinta-fraca'}`}>{p.titulo}</p>
                        <p className="text-[11px] leading-snug text-tinta-fraca">{p.descricao}</p>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          <p className="relative z-10 hidden text-[11px] italic leading-snug text-tinta-fraca md:block">
            "Prazo lembrado é prazo cumprido."
            <br />
            <span className="not-italic text-tinta-fraca/70">Contratos Jurídicos</span>
          </p>
        </aside>

        {/* Conteudo do passo atual. */}
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
            <div>
              <h1 className="text-[15px] font-semibold text-tinta">Configurar novo contrato</h1>
              <p className="mt-0.5 text-[12px] text-tinta-fraca">
                Preencha os dados abaixo. Os campos marcados são obrigatórios em cada etapa.
              </p>
            </div>
            <Link href="/contratos" aria-label="Fechar" className="text-tinta-fraca hover:text-tinta">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Link>
          </div>

          <div className="flex-1 space-y-5 px-6 py-5">
            {/* Passo 1: Identificação */}
            <div hidden={passo !== 0} className="space-y-4">
              <CampoCartao label="Nome do contrato" icone="tag">
                <input required={passo === 0} placeholder="Ex.: Locação – Unidade Curitiba" className={classeMini} {...campo('nome')} />
              </CampoCartao>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Categoria" icone="tag">
                  <SelectMini required={passo === 0} {...campo('categoria')}>
                    <option value="" disabled>Selecione</option>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectMini>
                </CampoCartao>
                <CampoCartao label="Empresa" icone="predio">
                  <SelectMini required={passo === 0} {...campo('empresa')}>
                    <option value="" disabled>Selecione</option>
                    {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </SelectMini>
                </CampoCartao>
                <CampoCartao label="Filial" icone="predio">
                  <SelectMini required={passo === 0} {...campo('filial')}>
                    <option value="" disabled>Selecione</option>
                    {FILIAIS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </SelectMini>
                </CampoCartao>
                <CampoCartao label="Área responsável" icone="predio">
                  <SelectMini required={passo === 0} {...campo('areaResponsavel')}>
                    <option value="" disabled>Selecione</option>
                    {AREAS_RESPONSAVEIS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </SelectMini>
                </CampoCartao>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CampoCartao label="Fornecedor / Contratada" icone="predio">
                  <input required={passo === 0} placeholder="Razão social" className={classeMini} {...campo('fornecedor')} />
                </CampoCartao>
                <CampoCartao label="CNPJ / CPF" icone="documento">
                  <input required={passo === 0} placeholder="00.000.000/0000-00" className={classeMini} {...campo('documento')} />
                </CampoCartao>
                <CampoCartao label="Gestor do contrato" icone="pessoa">
                  <input required={passo === 0} placeholder="Nome do gestor" className={classeMini} {...campo('gestor')} />
                </CampoCartao>
                <CampoCartao label="Responsável jurídico" icone="pessoa">
                  <input required={passo === 0} placeholder="Nome" className={classeMini} {...campo('responsavelJuridico')} />
                </CampoCartao>
              </div>

              <CampoCartao label="Objeto do contrato" icone="documento">
                <textarea required={passo === 0} rows={2} className={`${classeMini} resize-none`} {...campo('objeto')} />
              </CampoCartao>

              <CampoArquivo arquivo={arquivo} erro={erroArquivo} onSelecionar={selecionarArquivo} onRemover={() => setArquivo(null)} />
            </div>

            {/* Passo 2: Vigência e financeiro */}
            <div hidden={passo !== 1} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Início" icone="calendario">
                  <input required={passo === 1} type="date" className={classeMini} {...campo('dataInicio')} />
                </CampoCartao>
                <CampoCartao label="Término" icone="calendario">
                  <input required={passo === 1} type="date" className={classeMini} {...campo('dataFim')} />
                </CampoCartao>
                <CampoCartao label="Aviso de cancelamento" icone="refresh">
                  <input required={passo === 1} type="number" min={0} className={classeMini} {...campo('prazoAviso')} />
                </CampoCartao>
                <CampoCartao label="Renovação automática" icone="refresh">
                  <SelectMini required={passo === 1} {...campo('renovacaoAutomatica')}>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </SelectMini>
                </CampoCartao>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Valor mensal (R$)" icone="moeda">
                  <input required={passo === 1} type="number" min={0} step="0.01" className={classeMini} {...campo('valorMensal')} />
                </CampoCartao>
                <CampoCartao label="Forma de pagamento" icone="banco">
                  <input required={passo === 1} placeholder="Boleto…" className={classeMini} {...campo('formaPagamento')} />
                </CampoCartao>
                <CampoCartao label="Centro de custo" icone="pasta">
                  <input required={passo === 1} placeholder="CC-0000" className={classeMini} {...campo('centroCusto')} />
                </CampoCartao>
                <CampoCartao label="Índice de reajuste" icone="indice">
                  <SelectMini required={passo === 1} {...campo('indiceReajuste')}>
                    <option value="" disabled>Selecione</option>
                    {INDICES.map((i) => <option key={i} value={i}>{i}</option>)}
                  </SelectMini>
                </CampoCartao>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Data-base de reajuste" icone="calendario">
                  <input required={passo === 1} type="date" className={classeMini} {...campo('dataBaseReajuste')} />
                </CampoCartao>
              </div>
            </div>

            {/* Passo 3: Revisar e salvar */}
            <div hidden={passo !== 2} className="space-y-4">
              {enviado ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-status-vigente/40 bg-status-vigente-fraca px-4 py-10 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-status-vigente text-marca-tinta">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-status-vigente">Contrato cadastrado</p>
                    <p className="mt-1 text-[12px] text-tinta-fraca">
                      Ele já entra como vigente e passa a contar para os alertas de vencimento e de prazo de decisão.
                    </p>
                  </div>
                  <Link
                    href="/contratos"
                    className="mt-2 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
                  >
                    Ver contratos
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-[12px] text-tinta-fraca">
                    Confira os dados preenchidos antes de salvar. Para corrigir algo, volte à etapa correspondente.
                  </p>

                  <div className="rounded-xl border border-borda bg-painel-2/60 p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-marca">Identificação</p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <LinhaResumo label="Nome do contrato" valor={dados.nome} />
                      <LinhaResumo label="Categoria" valor={dados.categoria} />
                      <LinhaResumo label="Empresa" valor={dados.empresa} />
                      <LinhaResumo label="Filial" valor={dados.filial} />
                      <LinhaResumo label="Área responsável" valor={dados.areaResponsavel} />
                      <LinhaResumo label="Fornecedor / Contratada" valor={dados.fornecedor} />
                      <LinhaResumo label="CNPJ / CPF" valor={dados.documento} />
                      <LinhaResumo label="Gestor do contrato" valor={dados.gestor} />
                      <LinhaResumo label="Responsável jurídico" valor={dados.responsavelJuridico} />
                      <div className="col-span-full">
                        <LinhaResumo label="Objeto do contrato" valor={dados.objeto} />
                      </div>
                      <LinhaResumo label="Contrato assinado" valor={arquivo ? `${arquivo.name} (${formatarTamanho(arquivo.size)})` : ''} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-borda bg-painel-2/60 p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-marca">Vigência e financeiro</p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <LinhaResumo label="Início" valor={dados.dataInicio ? formatarData(dados.dataInicio) : ''} />
                      <LinhaResumo label="Término" valor={dados.dataFim ? formatarData(dados.dataFim) : ''} />
                      <LinhaResumo label="Aviso de cancelamento" valor={dados.prazoAviso ? `${dados.prazoAviso} dias antes` : ''} />
                      <LinhaResumo label="Renovação automática" valor={dados.renovacaoAutomatica === 'sim' ? 'Sim' : 'Não'} />
                      <LinhaResumo label="Valor mensal" valor={dados.valorMensal && !Number.isNaN(valorMensalNum) ? formatarMoeda(valorMensalNum) : ''} />
                      <LinhaResumo label="Forma de pagamento" valor={dados.formaPagamento} />
                      <LinhaResumo label="Centro de custo" valor={dados.centroCusto} />
                      <LinhaResumo label="Índice de reajuste" valor={dados.indiceReajuste} />
                      <LinhaResumo label="Data-base de reajuste" valor={dados.dataBaseReajuste ? formatarData(dados.dataBaseReajuste) : ''} />
                    </div>
                  </div>

                  <CampoCartao label="Observações (opcional)" icone="documento">
                    <textarea rows={3} placeholder="Contexto adicional para o Jurídico…" className={`${classeMini} resize-none`} {...campo('observacoes')} />
                  </CampoCartao>
                </>
              )}
            </div>
          </div>

          <div hidden={enviado} className="flex items-center justify-between gap-3 border-t border-borda px-6 py-4">
            <div />
            <div className="flex items-center gap-2">
              {passo > 0 && (
                <button type="button" onClick={voltar} className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
                  Voltar
                </button>
              )}
              <Link href="/contratos" className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
                Cancelar
              </Link>
              {!ultimoPasso ? (
                <button type="button" onClick={avancar} className="flex items-center gap-1.5 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90">
                  Avançar
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button type="button" onClick={salvar} className="flex items-center gap-1.5 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Salvar contrato
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
