'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'
import { useCriarContrato } from '@/lib/api/contratos'
import { problemaNoArquivo } from '@/lib/api/documentos'
import { useOpcoes } from '@/lib/api/opcoes'
import { INDICES_REAJUSTE } from '@/lib/shared/contratos'
import { EXTENSOES_ACEITAS, formatarTamanho } from '@/lib/shared/documentos'
import type { CampoOpcao } from '@/lib/shared/opcoes'
import { formatarData, formatarMoeda } from '@/lib/shared/status'

/**
 * Cadastro de contrato em tres passos (identificacao, vigencia/financeiro,
 * revisao). Quem valida e a API: os erros voltam por campo e o formulario
 * leva a pessoa ao passo onde esta o primeiro problema.
 *
 * As opcoes de Categoria, Segmento, Empresa, Filial, Centro de Custo e Area
 * Responsavel vem de Configuracoes › Opcoes de cadastro (so as ativas); o
 * formulario guarda o id da opcao.
 *
 * O contrato assinado (PDF/Word, opcional) vai no mesmo pedido: contrato e
 * arquivo sao gravados juntos, ou nenhum dos dois.
 */

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
  cadeado: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  clipe: 'M21.4 11.1l-8.7 8.7a5 5 0 01-7.1-7.1l8.7-8.7a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9',
}

function Icone({ nome }: { nome: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d={ICONES[nome] ?? ICONES.tag} />
    </svg>
  )
}

/** Cartão de campo no padrão do modal "Nova análise" do Princevision: rótulo com ícone em cima, controle sem moldura própria embaixo. */
function CampoCartao({ label, icone, erro, children }: { label: string; icone: string; erro?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-painel-2/60 p-3 ${erro ? 'border-status-vencido/60' : 'border-borda'}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">
        <span className="text-marca">
          <Icone nome={icone} />
        </span>
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
      {erro && <p className="mt-1 text-[11px] text-status-vencido">{erro}</p>}
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

/** O formulario guarda tudo como texto (o que os inputs dao); `montarCorpo` converte para a API. */
interface DadosContrato {
  nome: string
  categoriaId: string
  segmentoId: string
  empresaId: string
  filialId: string
  areaResponsavelId: string
  fornecedorNome: string
  fornecedorDocumento: string
  fornecedorContato: string
  gestorNome: string
  gestorEmail: string
  responsavelJuridicoNome: string
  responsavelJuridicoEmail: string
  acessoRestrito: 'sim' | 'nao'
  objeto: string
  dataInicio: string
  dataFim: string
  prazoAvisoCancelamentoDias: string
  renovacaoAutomatica: 'sim' | 'nao'
  valorMensal: string
  formaPagamento: string
  centroCustoId: string
  indiceReajuste: string
  dataBaseReajuste: string
  multaRescisao: string
  observacoes: string
}

const VAZIO: DadosContrato = {
  nome: '',
  categoriaId: '',
  segmentoId: '',
  empresaId: '',
  filialId: '',
  areaResponsavelId: '',
  fornecedorNome: '',
  fornecedorDocumento: '',
  fornecedorContato: '',
  gestorNome: '',
  gestorEmail: '',
  responsavelJuridicoNome: '',
  responsavelJuridicoEmail: '',
  acessoRestrito: 'nao',
  objeto: '',
  dataInicio: '',
  dataFim: '',
  prazoAvisoCancelamentoDias: '90',
  renovacaoAutomatica: 'nao',
  valorMensal: '',
  formaPagamento: '',
  centroCustoId: '',
  indiceReajuste: '',
  dataBaseReajuste: '',
  multaRescisao: '',
  observacoes: '',
}

/** Em que passo esta cada campo -- para levar a pessoa ao primeiro erro. */
const PASSO_DO_CAMPO: Partial<Record<keyof DadosContrato, number>> = {
  dataInicio: 1,
  dataFim: 1,
  prazoAvisoCancelamentoDias: 1,
  renovacaoAutomatica: 1,
  valorMensal: 1,
  formaPagamento: 1,
  centroCustoId: 1,
  indiceReajuste: 1,
  dataBaseReajuste: 1,
  multaRescisao: 1,
  observacoes: 2,
}
const passoDoCampo = (campo: string) => PASSO_DO_CAMPO[campo as keyof DadosContrato] ?? 0

/** "25.000,50" / "25000.5" -> 25000.5; vazio -> undefined (a API diz o que falta). */
function numero(texto: string): number | undefined {
  const t = texto.trim()
  if (!t) return undefined
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normalizado)
}

function montarCorpo(d: DadosContrato, confirmarDuplicidade: boolean) {
  const multa = numero(d.multaRescisao)
  return {
    nome: d.nome,
    categoriaId: d.categoriaId,
    segmentoId: d.segmentoId,
    empresaId: d.empresaId,
    filialId: d.filialId,
    areaResponsavelId: d.areaResponsavelId,
    centroCustoId: d.centroCustoId,
    fornecedorNome: d.fornecedorNome,
    fornecedorDocumento: d.fornecedorDocumento,
    fornecedorContato: d.fornecedorContato || null,
    objeto: d.objeto,
    observacoes: d.observacoes || null,
    gestorNome: d.gestorNome,
    gestorEmail: d.gestorEmail,
    responsavelJuridicoNome: d.responsavelJuridicoNome,
    responsavelJuridicoEmail: d.responsavelJuridicoEmail,
    acessoRestrito: d.acessoRestrito === 'sim',
    dataInicio: d.dataInicio,
    dataFim: d.dataFim,
    renovacaoAutomatica: d.renovacaoAutomatica === 'sim',
    prazoAvisoCancelamentoDias: numero(d.prazoAvisoCancelamentoDias),
    valorMensal: numero(d.valorMensal),
    formaPagamento: d.formaPagamento,
    indiceReajuste: d.indiceReajuste,
    dataBaseReajuste: d.dataBaseReajuste,
    multaRescisao: multa === undefined ? null : multa,
    ...(confirmarDuplicidade ? { confirmarDuplicidade: true } : {}),
  }
}

/** Linha do resumo: mostra o dado ou avisa que ficou em branco. */
function LinhaResumo({ label, valor, erro }: { label: string; valor: string; erro?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.05em] text-tinta-fraca">{label}</p>
      <p className={`mt-0.5 text-[13px] ${valor ? 'text-tinta' : 'text-tinta-fraca italic'}`}>{valor || 'Não preenchido'}</p>
      {erro && <p className="text-[11px] text-status-vencido">{erro}</p>}
    </div>
  )
}

/** Contrato assinado: escolher, ver nome/tamanho, trocar ou tirar. */
function CampoArquivo({ arquivo, erro, onEscolher }: { arquivo: File | null; erro?: string; onEscolher: (a: File | null) => void }) {
  return (
    <div className={`rounded-xl border bg-painel-2/60 p-3 ${erro ? 'border-status-vencido/60' : 'border-borda'}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">
        <span className="text-marca">
          <Icone nome="clipe" />
        </span>
        Contrato assinado (PDF ou Word, opcional)
      </div>
      {arquivo ? (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-tinta">
            {arquivo.name} <span className="font-normal text-tinta-fraca">· {formatarTamanho(arquivo.size)}</span>
          </span>
          <button type="button" onClick={() => onEscolher(null)} className="shrink-0 text-[11px] text-status-vencido hover:underline">
            Remover
          </button>
        </div>
      ) : (
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[13px] text-tinta-fraca hover:text-tinta">
          <span className="rounded-md border border-borda bg-painel px-2.5 py-1 text-[11px] font-semibold text-tinta">Escolher arquivo</span>
          <span>Nenhum arquivo selecionado</span>
          <input
            type="file"
            accept={EXTENSOES_ACEITAS.join(',')}
            onChange={(e) => {
              onEscolher(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
            className="hidden"
          />
        </label>
      )}
      {erro && <p className="mt-1.5 text-[11px] text-status-vencido">{erro}</p>}
    </div>
  )
}

interface Parecido {
  id: string
  codigo: string
  nome: string
  dataInicio: string
  dataFim: string
}

export default function NovoContrato() {
  const router = useRouter()
  const { data: opcoes, isError: erroOpcoes } = useOpcoes()
  const criar = useCriarContrato()

  const [passo, setPasso] = useState(0)
  const [dados, setDados] = useState<DadosContrato>(VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [parecidos, setParecidos] = useState<Parecido[] | null>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)

  function escolherArquivo(a: File | null) {
    setErros(({ arquivo: _, ...resto }) => resto)
    if (a) {
      const problema = problemaNoArquivo(a)
      if (problema) return setErros((e) => ({ ...e, arquivo: problema }))
    }
    setArquivo(a)
  }

  const ultimoPasso = passo === PASSOS.length - 1

  function campo<K extends keyof DadosContrato>(chave: K) {
    return {
      value: dados[chave],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setDados((d) => ({ ...d, [chave]: e.target.value }))
        if (erros[chave]) setErros(({ [chave]: _, ...resto }) => resto)
      },
    }
  }

  const listaOpcoes = (c: CampoOpcao) => opcoes?.[c] ?? []
  const nomeOpcao = (c: CampoOpcao, id: string) => listaOpcoes(c).find((o) => o.id === id)?.valor ?? ''

  // Funcao que devolve JSX (e nao componente): declarado aqui dentro, um
  // componente seria recriado a cada render e o select perderia o foco.
  function selectOpcao(chave: keyof DadosContrato, campoOpcao: CampoOpcao) {
    return (
      <SelectMini {...campo(chave)}>
        <option value="" disabled>
          Selecione
        </option>
        {listaOpcoes(campoOpcao).map((o) => (
          <option key={o.id} value={o.id}>
            {o.valor}
          </option>
        ))}
      </SelectMini>
    )
  }

  /**
   * So dispara por clique explicito no botao "Salvar contrato".
   *
   * De proposito nao e o onSubmit de um <form>: um <form> com varios campos
   * pode submeter sozinho com Enter em qualquer input, o que pularia a
   * revisao. Sem `<form>`, nao ha submissao implicita nenhuma para escapar.
   */
  async function salvar(confirmarDuplicidade = false) {
    setErroGeral('')
    setErros({})
    try {
      const contrato = await criar.mutateAsync({ dados: montarCorpo(dados, confirmarDuplicidade), arquivo })
      router.push(`/contratos/${contrato.id}`)
    } catch (erro) {
      if (!(erro instanceof ErroDaApi)) {
        setErroGeral('Erro inesperado. Tente novamente.')
        return
      }
      if (erro.codigo === 'TIPO_NAO_SUPORTADO' || erro.codigo === 'ARQUIVO_GRANDE') {
        setErros({ arquivo: erro.message })
        setPasso(0)
        setErroGeral('Confira o arquivo do contrato assinado.')
        return
      }
      if (erro.codigo === 'POSSIVEL_DUPLICIDADE') {
        setParecidos((erro.detalhes as { contratos: Parecido[] }).contratos)
        return
      }
      if (erro.codigo === 'VALIDACAO' && Object.keys(erro.campos).length) {
        setErros(erro.campos)
        setPasso(Math.min(...Object.keys(erro.campos).map(passoDoCampo)))
        setErroGeral('Corrija os campos destacados.')
        return
      }
      setErroGeral(erro.message)
    }
  }

  const valorMensalNum = numero(dados.valorMensal)
  const multaRescisaoNum = numero(dados.multaRescisao)
  const salvando = criar.isPending

  return (
    <div className="flex min-h-full items-start justify-center p-6">
      <div
        className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl border border-roxo/30 bg-painel md:grid-cols-[260px_1fr]"
        style={{ boxShadow: '0 30px 80px -20px color-mix(in srgb, var(--roxo) 45%, transparent)' }}
      >
        {/* Lateral: identidade do fluxo e os passos. */}
        <aside className="relative flex flex-col justify-between overflow-hidden border-b border-borda bg-painel-2/40 p-5 md:border-b-0 md:border-r">
          {/* Onda decorativa no rodape da lateral, como no modal de referencia. */}
          <svg className="pointer-events-none absolute bottom-0 left-0 w-full text-roxo/25" height="90" viewBox="0 0 260 90" fill="none" preserveAspectRatio="none" aria-hidden>
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
                const comErro = Object.keys(erros).some((c) => passoDoCampo(c) === i)
                return (
                  <li key={p.titulo}>
                    <button type="button" onClick={() => setPasso(i)} className="flex w-full items-start gap-3 text-left">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          comErro ? 'bg-status-vencido text-marca-tinta' : ativo || concluido ? 'bg-marca text-marca-tinta' : 'border border-borda text-tinta-fraca'
                        }`}
                      >
                        {comErro ? '!' : concluido ? '✓' : i + 1}
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
              <p className="mt-0.5 text-[12px] text-tinta-fraca">Preencha os dados abaixo. Os campos são conferidos ao salvar.</p>
              {erroOpcoes && (
                <p role="alert" className="mt-1 text-[12px] text-status-vencido">
                  Não foi possível carregar as opções de Categoria, Empresa, Filial etc. Recarregue a página.
                </p>
              )}
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
              <CampoCartao label="Nome do contrato" icone="tag" erro={erros.nome}>
                <input placeholder="Ex.: Locação – Unidade Curitiba" className={classeMini} {...campo('nome')} />
              </CampoCartao>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Categoria" icone="tag" erro={erros.categoriaId}>
                  {selectOpcao('categoriaId', 'categoria')}
                </CampoCartao>
                <CampoCartao label="Segmento" icone="pasta" erro={erros.segmentoId}>
                  {selectOpcao('segmentoId', 'segmento')}
                </CampoCartao>
                <CampoCartao label="Empresa" icone="predio" erro={erros.empresaId}>
                  {selectOpcao('empresaId', 'empresa')}
                </CampoCartao>
                <CampoCartao label="Filial" icone="predio" erro={erros.filialId}>
                  {selectOpcao('filialId', 'filial')}
                </CampoCartao>
                <CampoCartao label="Área responsável" icone="predio" erro={erros.areaResponsavelId}>
                  {selectOpcao('areaResponsavelId', 'area-responsavel')}
                </CampoCartao>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CampoCartao label="Fornecedor / Contratada" icone="predio" erro={erros.fornecedorNome}>
                  <input placeholder="Razão social" className={classeMini} {...campo('fornecedorNome')} />
                </CampoCartao>
                <CampoCartao label="CNPJ / CPF" icone="documento" erro={erros.fornecedorDocumento}>
                  <input placeholder="00.000.000/0000-00" className={classeMini} {...campo('fornecedorDocumento')} />
                </CampoCartao>
                <CampoCartao label="Contato do fornecedor (opcional)" icone="pessoa" erro={erros.fornecedorContato}>
                  <input placeholder="E-mail ou telefone" className={classeMini} {...campo('fornecedorContato')} />
                </CampoCartao>
                <div />
                <CampoCartao label="Gestor do contrato" icone="pessoa" erro={erros.gestorNome}>
                  <input placeholder="Nome do gestor" className={classeMini} {...campo('gestorNome')} />
                </CampoCartao>
                <CampoCartao label="E-mail do gestor" icone="documento" erro={erros.gestorEmail}>
                  <input type="email" placeholder="gestor@princesadoscampos.com.br" className={classeMini} {...campo('gestorEmail')} />
                </CampoCartao>
                <CampoCartao label="Responsável jurídico" icone="pessoa" erro={erros.responsavelJuridicoNome}>
                  <input placeholder="Nome" className={classeMini} {...campo('responsavelJuridicoNome')} />
                </CampoCartao>
                <CampoCartao label="E-mail do responsável jurídico" icone="documento" erro={erros.responsavelJuridicoEmail}>
                  <input type="email" placeholder="juridico@princesadoscampos.com.br" className={classeMini} {...campo('responsavelJuridicoEmail')} />
                </CampoCartao>
              </div>

              <CampoCartao label="Acesso restrito" icone="cadeado">
                <SelectMini {...campo('acessoRestrito')}>
                  <option value="nao">Não — todos os usuários veem</option>
                  <option value="sim">Sim — só administradores, o gestor e o responsável jurídico</option>
                </SelectMini>
                {dados.acessoRestrito === 'sim' && (
                  <p className="mt-1 text-[11px] text-tinta-fraca">
                    Quem enxerga é decidido pelos e-mails acima: use o e-mail de cada pessoa no Apps Princesa.
                  </p>
                )}
              </CampoCartao>

              <CampoCartao label="Objeto do contrato" icone="documento" erro={erros.objeto}>
                <textarea rows={2} className={`${classeMini} resize-none`} {...campo('objeto')} />
              </CampoCartao>

              <CampoArquivo arquivo={arquivo} erro={erros.arquivo} onEscolher={escolherArquivo} />
            </div>

            {/* Passo 2: Vigência e financeiro */}
            <div hidden={passo !== 1} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Início" icone="calendario" erro={erros.dataInicio}>
                  <input type="date" className={classeMini} {...campo('dataInicio')} />
                </CampoCartao>
                <CampoCartao label="Término" icone="calendario" erro={erros.dataFim}>
                  <input type="date" className={classeMini} {...campo('dataFim')} />
                </CampoCartao>
                <CampoCartao label="Aviso de cancelamento (dias)" icone="refresh" erro={erros.prazoAvisoCancelamentoDias}>
                  <input type="number" min={0} className={classeMini} {...campo('prazoAvisoCancelamentoDias')} />
                </CampoCartao>
                <CampoCartao label="Renovação automática" icone="refresh">
                  <SelectMini {...campo('renovacaoAutomatica')}>
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </SelectMini>
                </CampoCartao>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Valor mensal (R$)" icone="moeda" erro={erros.valorMensal}>
                  <input inputMode="decimal" placeholder="0,00" className={classeMini} {...campo('valorMensal')} />
                </CampoCartao>
                <CampoCartao label="Forma de pagamento" icone="banco" erro={erros.formaPagamento}>
                  <input placeholder="Boleto…" className={classeMini} {...campo('formaPagamento')} />
                </CampoCartao>
                <CampoCartao label="Centro de custo" icone="pasta" erro={erros.centroCustoId}>
                  {selectOpcao('centroCustoId', 'centro-custo')}
                </CampoCartao>
                <CampoCartao label="Índice de reajuste" icone="indice" erro={erros.indiceReajuste}>
                  <SelectMini {...campo('indiceReajuste')}>
                    <option value="" disabled>
                      Selecione
                    </option>
                    {INDICES_REAJUSTE.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </SelectMini>
                </CampoCartao>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CampoCartao label="Data-base de reajuste" icone="calendario" erro={erros.dataBaseReajuste}>
                  <input type="date" className={classeMini} {...campo('dataBaseReajuste')} />
                </CampoCartao>
                <CampoCartao label="Multa de rescisão (R$)" icone="moeda" erro={erros.multaRescisao}>
                  <input inputMode="decimal" placeholder="Opcional" className={classeMini} {...campo('multaRescisao')} />
                </CampoCartao>
              </div>
            </div>

            {/* Passo 3: Revisar e salvar */}
            <div hidden={passo !== 2} className="space-y-4">
              <p className="text-[12px] text-tinta-fraca">
                Confira os dados preenchidos antes de salvar. Para corrigir algo, volte à etapa correspondente.
              </p>

              <div className="rounded-xl border border-borda bg-painel-2/60 p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-marca">Identificação</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <LinhaResumo label="Nome do contrato" valor={dados.nome} />
                  <LinhaResumo label="Categoria" valor={nomeOpcao('categoria', dados.categoriaId)} />
                  <LinhaResumo label="Segmento" valor={nomeOpcao('segmento', dados.segmentoId)} />
                  <LinhaResumo label="Empresa" valor={nomeOpcao('empresa', dados.empresaId)} />
                  <LinhaResumo label="Filial" valor={nomeOpcao('filial', dados.filialId)} />
                  <LinhaResumo label="Área responsável" valor={nomeOpcao('area-responsavel', dados.areaResponsavelId)} />
                  <LinhaResumo label="Fornecedor / Contratada" valor={dados.fornecedorNome} />
                  <LinhaResumo label="CNPJ / CPF" valor={dados.fornecedorDocumento} />
                  <LinhaResumo label="Contato do fornecedor" valor={dados.fornecedorContato} />
                  <LinhaResumo label="Gestor do contrato" valor={dados.gestorNome} />
                  <LinhaResumo label="E-mail do gestor" valor={dados.gestorEmail} />
                  <LinhaResumo label="Responsável jurídico" valor={dados.responsavelJuridicoNome} />
                  <LinhaResumo label="E-mail do responsável jurídico" valor={dados.responsavelJuridicoEmail} />
                  <LinhaResumo label="Acesso restrito" valor={dados.acessoRestrito === 'sim' ? '🔒 Sim' : 'Não'} />
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
                  <LinhaResumo label="Aviso de cancelamento" valor={dados.prazoAvisoCancelamentoDias ? `${dados.prazoAvisoCancelamentoDias} dias antes` : ''} />
                  <LinhaResumo label="Renovação automática" valor={dados.renovacaoAutomatica === 'sim' ? 'Sim' : 'Não'} />
                  <LinhaResumo label="Valor mensal" valor={valorMensalNum !== undefined && !Number.isNaN(valorMensalNum) ? formatarMoeda(valorMensalNum) : ''} />
                  <LinhaResumo label="Forma de pagamento" valor={dados.formaPagamento} />
                  <LinhaResumo label="Centro de custo" valor={nomeOpcao('centro-custo', dados.centroCustoId)} />
                  <LinhaResumo label="Índice de reajuste" valor={dados.indiceReajuste} />
                  <LinhaResumo label="Data-base de reajuste" valor={dados.dataBaseReajuste ? formatarData(dados.dataBaseReajuste) : ''} />
                  <LinhaResumo
                    label="Multa de rescisão"
                    valor={multaRescisaoNum !== undefined && !Number.isNaN(multaRescisaoNum) ? formatarMoeda(multaRescisaoNum) : ''}
                  />
                </div>
              </div>

              <CampoCartao label="Observações (opcional)" icone="documento" erro={erros.observacoes}>
                <textarea rows={3} placeholder="Contexto adicional para o Jurídico…" className={`${classeMini} resize-none`} {...campo('observacoes')} />
              </CampoCartao>
            </div>

            {parecidos && (
              <div role="alertdialog" className="rounded-xl border border-status-alerta/50 bg-status-alerta-fraca p-4">
                <p className="text-[13px] font-semibold text-status-alerta">Já existe contrato aberto com este fornecedor e vigência que se cruza</p>
                <ul className="mt-2 space-y-1 text-[12px] text-tinta">
                  {parecidos.map((p) => (
                    <li key={p.id}>
                      <Link href={`/contratos/${p.id}`} target="_blank" className="font-mono text-marca hover:underline">
                        {p.codigo}
                      </Link>{' '}
                      — {p.nome} ({formatarData(p.dataInicio)} → {formatarData(p.dataFim)})
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-tinta-fraca">É mesmo um contrato novo (outro objeto, outra unidade)?</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={async () => {
                      setParecidos(null)
                      await salvar(true)
                    }}
                    className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-50"
                  >
                    Sim, cadastrar mesmo assim
                  </button>
                  <button type="button" onClick={() => setParecidos(null)} className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
                    Não, revisar
                  </button>
                </div>
              </div>
            )}

            {erroGeral && (
              <p role="alert" className="text-[12px] text-status-vencido">
                {erroGeral}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-borda px-6 py-4">
            <div />
            <div className="flex items-center gap-2">
              {passo > 0 && (
                <button type="button" onClick={() => setPasso((p) => p - 1)} className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
                  Voltar
                </button>
              )}
              <Link href="/contratos" className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
                Cancelar
              </Link>
              {!ultimoPasso ? (
                <button
                  type="button"
                  onClick={() => setPasso((p) => Math.min(p + 1, PASSOS.length - 1))}
                  className="flex items-center gap-1.5 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
                >
                  Avançar
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={salvando || !!parecidos}
                  onClick={() => salvar()}
                  className="flex items-center gap-1.5 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-50"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {salvando ? 'Salvando…' : 'Salvar contrato'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
