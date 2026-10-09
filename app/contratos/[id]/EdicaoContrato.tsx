'use client'

import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'
import { useEditarContrato } from '@/lib/api/contratos'
import { useOpcoes } from '@/lib/api/opcoes'
import { ACOES_VENCIMENTO, INDICES_REAJUSTE, STATUS_ACAO, type ContratoDetalhe } from '@/lib/shared/contratos'
import type { CampoOpcao, Opcao } from '@/lib/shared/opcoes'

/**
 * Edição do contrato (tudo, menos vigência e valor -- esses mudam por aditivo).
 *
 * Manda só o que mudou, junto da `versao` lida: se outra pessoa salvou antes,
 * a API recusa (409) e a tela pede para recarregar, em vez de sobrescrever.
 */

type Form = Record<string, string>

function paraForm(c: ContratoDetalhe): Form {
  return {
    nome: c.nome,
    categoriaId: c.categoria.id,
    segmentoId: c.segmento.id,
    empresaId: c.empresa.id,
    filialId: c.filial.id,
    areaResponsavelId: c.areaResponsavel.id,
    centroCustoId: c.centroCusto.id,
    fornecedorNome: c.fornecedorNome,
    fornecedorDocumento: c.fornecedorDocumento,
    fornecedorContato: c.fornecedorContato ?? '',
    objeto: c.objeto,
    observacoes: c.observacoes ?? '',
    gestorNome: c.gestorNome,
    gestorEmail: c.gestorEmail,
    responsavelJuridicoNome: c.responsavelJuridicoNome,
    responsavelJuridicoEmail: c.responsavelJuridicoEmail,
    acessoRestrito: c.acessoRestrito ? 'sim' : 'nao',
    renovacaoAutomatica: c.renovacaoAutomatica ? 'sim' : 'nao',
    prazoAvisoCancelamentoDias: String(c.prazoAvisoCancelamentoDias),
    formaPagamento: c.formaPagamento,
    indiceReajuste: c.indiceReajuste,
    dataBaseReajuste: c.dataBaseReajuste,
    multaRescisao: c.multaRescisao === null ? '' : String(c.multaRescisao).replace('.', ','),
    acaoVencimento: c.acaoVencimento?.acao ?? '',
    responsavelAcao: c.acaoVencimento?.responsavel ?? '',
    prazoAcao: c.acaoVencimento?.prazo ?? '',
    statusAcao: c.acaoVencimento?.status ?? 'Pendente',
  }
}

function numero(texto: string): number | null {
  const t = texto.trim()
  if (!t) return null
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

/** Form -> valor da API, campo a campo. */
function valorApi(campo: string, v: string): unknown {
  switch (campo) {
    case 'acessoRestrito':
    case 'renovacaoAutomatica':
      return v === 'sim'
    case 'prazoAvisoCancelamentoDias':
      return v.trim() === '' ? undefined : Number(v)
    case 'multaRescisao':
      return numero(v)
    case 'fornecedorContato':
    case 'observacoes':
      return v.trim() || null
    default:
      return v
  }
}

const ACAO = ['acaoVencimento', 'responsavelAcao', 'prazoAcao', 'statusAcao']

/** Só o que mudou. A ação de vencimento vai inteira quando qualquer parte dela muda. */
function diferencas(original: Form, atual: Form): Record<string, unknown> {
  const corpo: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(atual)) {
    if (ACAO.includes(k)) continue
    if (v !== original[k]) corpo[k] = valorApi(k, v)
  }
  if (ACAO.some((k) => atual[k] !== original[k])) {
    if (!atual.acaoVencimento) corpo.acaoVencimento = null
    else {
      corpo.acaoVencimento = atual.acaoVencimento
      corpo.responsavelAcao = atual.responsavelAcao.trim() || null
      corpo.prazoAcao = atual.prazoAcao || null
      corpo.statusAcao = atual.statusAcao
    }
  }
  return corpo
}

const classeInput =
  'mt-1 w-full rounded-md border bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

export function EdicaoContrato({ contrato, aoTerminar }: { contrato: ContratoDetalhe; aoTerminar: () => void }) {
  const [original] = useState(() => paraForm(contrato))
  const [form, setForm] = useState(original)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [conflito, setConflito] = useState(false)
  const editar = useEditarContrato(contrato.id)
  const { data: opcoes } = useOpcoes()

  const mudou = Object.keys(diferencas(original, form)).length > 0

  // Funcoes que devolvem JSX (nao componentes): declaradas aqui dentro, um
  // componente seria recriado a cada tecla e o campo perderia o foco.
  function campoTexto({ campo, rotulo, tipo = 'text', largo = false }: { campo: string; rotulo: string; tipo?: string; largo?: boolean }) {
    return (
      <label key={campo} className={`block ${largo ? 'col-span-full' : ''}`}>
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</span>
        {largo ? (
          <textarea rows={3} value={form[campo]} onChange={(e) => alterar(campo, e.target.value)} className={`${classeInput} resize-y ${erros[campo] ? 'border-status-vencido' : 'border-borda'}`} />
        ) : (
          <input type={tipo} value={form[campo]} onChange={(e) => alterar(campo, e.target.value)} className={`${classeInput} ${erros[campo] ? 'border-status-vencido' : 'border-borda'}`} />
        )}
        {erros[campo] && <span className="mt-0.5 block text-[11px] text-status-vencido">{erros[campo]}</span>}
      </label>
    )
  }

  function escolha({ campo, rotulo, valores }: { campo: string; rotulo: string; valores: { valor: string; rotulo: string }[] }) {
    return (
      <label key={campo} className="block">
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</span>
        <select value={form[campo]} onChange={(e) => alterar(campo, e.target.value)} className={`${classeInput} ${erros[campo] ? 'border-status-vencido' : 'border-borda'}`}>
          {valores.map((v) => (
            <option key={v.valor} value={v.valor}>
              {v.rotulo}
            </option>
          ))}
        </select>
        {erros[campo] && <span className="mt-0.5 block text-[11px] text-status-vencido">{erros[campo]}</span>}
      </label>
    )
  }

  /** Opções ativas + a atual do contrato (mesmo que desativada depois). */
  function opcoesDe(campo: CampoOpcao, atual: { id: string; valor: string; ativo: boolean }) {
    const ativas: Pick<Opcao, 'id' | 'valor'>[] = opcoes?.[campo] ?? []
    const lista = ativas.some((o) => o.id === atual.id) ? ativas : [{ id: atual.id, valor: `${atual.valor} (inativa)` }, ...ativas]
    return lista.map((o) => ({ valor: o.id, rotulo: o.valor }))
  }

  function alterar(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }))
    if (erros[campo]) setErros(({ [campo]: _, ...resto }) => resto)
  }

  async function salvar() {
    setErroGeral('')
    setErros({})
    try {
      await editar.mutateAsync({ versao: contrato.versao, ...diferencas(original, form) })
      aoTerminar()
    } catch (erro) {
      if (!(erro instanceof ErroDaApi)) return setErroGeral('Erro inesperado. Tente novamente.')
      if (erro.codigo === 'CONFLITO') setConflito(true)
      if (erro.codigo === 'VALIDACAO' && Object.keys(erro.campos).length) {
        setErros(erro.campos)
        return setErroGeral('Corrija os campos destacados.')
      }
      setErroGeral(erro.message)
    }
  }

  const simNao = [
    { valor: 'nao', rotulo: 'Não' },
    { valor: 'sim', rotulo: 'Sim' },
  ]

  return (
    <div className="grad-quadro space-y-5 rounded-xl border p-5" style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}>
      <div>
        <p className="text-[13px] font-semibold text-tinta">Editar contrato</p>
        <p className="text-[12px] text-tinta-fraca">Vigência e valor mensal mudam por aditivo, não por aqui. Toda alteração fica na auditoria.</p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campoTexto({ campo: 'nome', rotulo: 'Nome do contrato' })}
        {escolha({ campo: 'categoriaId', rotulo: 'Categoria', valores: opcoesDe('categoria', contrato.categoria) })}
        {escolha({ campo: 'segmentoId', rotulo: 'Segmento', valores: opcoesDe('segmento', contrato.segmento) })}
        {escolha({ campo: 'empresaId', rotulo: 'Empresa', valores: opcoesDe('empresa', contrato.empresa) })}
        {escolha({ campo: 'filialId', rotulo: 'Filial', valores: opcoesDe('filial', contrato.filial) })}
        {escolha({ campo: 'areaResponsavelId', rotulo: 'Área responsável', valores: opcoesDe('area-responsavel', contrato.areaResponsavel) })}
        {campoTexto({ campo: 'fornecedorNome', rotulo: 'Fornecedor / razão social' })}
        {campoTexto({ campo: 'fornecedorDocumento', rotulo: 'CNPJ / CPF' })}
        {campoTexto({ campo: 'fornecedorContato', rotulo: 'Contato do fornecedor' })}
        {campoTexto({ campo: 'objeto', rotulo: 'Objeto do contrato', largo: true })}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campoTexto({ campo: 'gestorNome', rotulo: 'Gestor' })}
        {campoTexto({ campo: 'gestorEmail', rotulo: 'E-mail do gestor', tipo: 'email' })}
        <div />
        {campoTexto({ campo: 'responsavelJuridicoNome', rotulo: 'Responsável jurídico' })}
        {campoTexto({ campo: 'responsavelJuridicoEmail', rotulo: 'E-mail do responsável jurídico', tipo: 'email' })}
        {contrato.permissoes.alterarRestricao ? escolha({ campo: 'acessoRestrito', rotulo: 'Acesso restrito', valores: simNao }) : <div />}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campoTexto({ campo: 'prazoAvisoCancelamentoDias', rotulo: 'Aviso de cancelamento (dias)', tipo: 'number' })}
        {escolha({ campo: 'renovacaoAutomatica', rotulo: 'Renovação automática', valores: simNao })}
        {campoTexto({ campo: 'formaPagamento', rotulo: 'Forma de pagamento' })}
        {escolha({ campo: 'centroCustoId', rotulo: 'Centro de custo', valores: opcoesDe('centro-custo', contrato.centroCusto) })}
        {escolha({ campo: 'indiceReajuste', rotulo: 'Índice de reajuste', valores: INDICES_REAJUSTE.map((i) => ({ valor: i, rotulo: i })) })}
        {campoTexto({ campo: 'dataBaseReajuste', rotulo: 'Data-base de reajuste', tipo: 'date' })}
        {campoTexto({ campo: 'multaRescisao', rotulo: 'Multa de rescisão (R$)' })}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {escolha({ campo: 'acaoVencimento', rotulo: 'Ação para o vencimento', valores: [{ valor: '', rotulo: 'Nenhuma' }, ...ACOES_VENCIMENTO.map((a) => ({ valor: a, rotulo: a }))] })}
        {form.acaoVencimento && (
          <>
            {campoTexto({ campo: 'responsavelAcao', rotulo: 'Responsável pela ação' })}
            {campoTexto({ campo: 'prazoAcao', rotulo: 'Prazo da ação', tipo: 'date' })}
            {escolha({ campo: 'statusAcao', rotulo: 'Status da ação', valores: STATUS_ACAO.map((s) => ({ valor: s, rotulo: s })) })}
          </>
        )}
      </section>

      {campoTexto({ campo: 'observacoes', rotulo: 'Observações', largo: true })}

      {erroGeral && (
        <p role="alert" className="text-[12px] text-status-vencido">
          {erroGeral}{' '}
          {conflito && (
            <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
              Recarregar
            </button>
          )}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoTerminar} className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={!mudou || editar.isPending}
          className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40"
        >
          {editar.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
