'use client'

import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'
import { useAnularAditivo, useRegistrarAditivo } from '@/lib/api/contratos'
import { problemaNoArquivo, urlArquivo } from '@/lib/api/documentos'
import type { ContratoDetalhe, Vigencia } from '@/lib/shared/contratos'
import { EXTENSOES_ACEITAS, formatarTamanho } from '@/lib/shared/documentos'
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/shared/status'

/**
 * Aba Histórico: vigência original (ou de renovação) e aditivos.
 *
 * Vigência e valor mensal só mudam por aqui (aditivo). Um aditivo errado não
 * é editado: o administrador anula o mais recente, que continua visível
 * riscado, e o contrato volta à vigência anterior.
 */

const classeInput =
  'mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

function numero(texto: string): number | undefined {
  const t = texto.trim()
  if (!t) return undefined
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

function FormAditivo({ contrato, aoFechar }: { contrato: ContratoDetalhe; aoFechar: () => void }) {
  const [f, setF] = useState({
    dataInicio: contrato.dataInicio,
    dataFim: contrato.dataFim,
    valorMensal: String(contrato.valorMensal).replace('.', ','),
    observacao: '',
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [confirmarEncurtamento, setConfirmarEncurtamento] = useState<string | null>(null)
  const registrar = useRegistrarAditivo(contrato.id)

  async function salvar(confirmado = false) {
    setErro('')
    setErros({})
    try {
      await registrar.mutateAsync({
        dados: {
          versao: contrato.versao,
          dataInicio: f.dataInicio,
          dataFim: f.dataFim,
          valorMensal: numero(f.valorMensal),
          observacao: f.observacao.trim() || null,
          ...(confirmado ? { confirmarEncurtamento: true } : {}),
        },
        arquivo,
      })
      aoFechar()
    } catch (e) {
      if (!(e instanceof ErroDaApi)) return setErro('Erro inesperado. Tente novamente.')
      if ((e.detalhes as { confirmar?: string } | undefined)?.confirmar === 'confirmarEncurtamento') return setConfirmarEncurtamento(e.message)
      if (Object.keys(e.campos).length) setErros(e.campos)
      setErro(e.message)
    }
  }

  const campo = (k: keyof typeof f, rotulo: string, tipo = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</span>
      <input type={tipo} value={f[k]} onChange={(e) => setF((v) => ({ ...v, [k]: e.target.value }))} className={classeInput} {...extra} />
      {erros[k] && <span className="text-[11px] text-status-vencido">{erros[k]}</span>}
    </label>
  )

  return (
    <div className="grad-quadro space-y-3 rounded-xl border p-4" style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}>
      <p className="text-[13px] font-semibold text-tinta">Registrar aditivo</p>
      <p className="text-[12px] text-tinta-fraca">
        Hoje: vigência até {formatarData(contrato.dataFim)}, {formatarMoeda(contrato.valorMensal)}/mês. O aditivo passa a valer como a vigência e o valor atuais.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {campo('dataInicio', 'Início do aditivo', 'date', { min: contrato.dataInicio })}
        {campo('dataFim', 'Novo término', 'date')}
        {campo('valorMensal', 'Valor mensal (R$)', 'text', { inputMode: 'decimal' })}
      </div>
      {campo('observacao', 'Observação', 'text', { placeholder: 'Ex.: reajuste anual, prorrogação de prazo…', maxLength: 1000 })}

      <div>
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Aditivo assinado (PDF ou Word, opcional)</span>
        {arquivo ? (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-borda bg-painel-2 px-3 py-2">
            <span className="truncate text-[13px] font-semibold text-tinta">
              {arquivo.name} <span className="font-normal text-tinta-fraca">· {formatarTamanho(arquivo.size)}</span>
            </span>
            <button type="button" onClick={() => setArquivo(null)} className="shrink-0 text-[11px] text-status-vencido hover:underline">
              Remover
            </button>
          </div>
        ) : (
          <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta-fraca hover:text-tinta">
            <span className="rounded-md border border-borda bg-painel px-2.5 py-1 text-[11px] font-semibold text-tinta">Escolher arquivo</span>
            <span>Nenhum arquivo selecionado</span>
            <input
              type="file"
              accept={EXTENSOES_ACEITAS.join(',')}
              className="hidden"
              onChange={(e) => {
                const a = e.target.files?.[0] ?? null
                e.target.value = ''
                const problema = a && problemaNoArquivo(a)
                if (problema) return setErro(problema)
                setArquivo(a)
              }}
            />
          </label>
        )}
      </div>

      {confirmarEncurtamento && (
        <div role="alertdialog" className="rounded-lg border border-status-vencido/50 bg-status-vencido-fraca p-3 text-[12px]">
          <p className="text-status-vencido">{confirmarEncurtamento}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmarEncurtamento(null)
                void salvar(true)
              }}
              className="rounded-md bg-status-vencido px-3 py-1.5 font-semibold text-white"
            >
              Sim, registrar mesmo assim
            </button>
            <button type="button" onClick={() => setConfirmarEncurtamento(null)} className="rounded-md border border-borda px-3 py-1.5 text-tinta-fraca">
              Revisar
            </button>
          </div>
        </div>
      )}
      {erro && !confirmarEncurtamento && (
        <p role="alert" className="text-[12px] text-status-vencido">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoFechar} className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => salvar()}
          disabled={registrar.isPending || !!confirmarEncurtamento}
          className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40"
        >
          {registrar.isPending ? 'Registrando…' : 'Registrar aditivo'}
        </button>
      </div>
    </div>
  )
}

function LinhaVigencia({ v, contrato }: { v: Vigencia; contrato: ContratoDetalhe }) {
  const [anulando, setAnulando] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const anular = useAnularAditivo(contrato.id)

  return (
    <div
      className={`grad-quadro flex items-start gap-3 rounded-xl border p-4 ${v.anulado ? 'opacity-60' : ''}`}
      style={{ '--cor-quadro': 'var(--status-renovado)' } as React.CSSProperties}
    >
      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marca" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className={`text-[13px] font-semibold text-tinta ${v.anulado ? 'line-through' : ''}`}>
            {v.tipo}
            {v.numero !== null && ` ${String(v.numero).padStart(2, '0')}`}
          </p>
          {v.anulavel && !anulando && (
            <button type="button" onClick={() => setAnulando(true)} className="text-[11px] font-semibold text-status-vencido hover:underline">
              Anular
            </button>
          )}
        </div>
        <p className="text-[12px] text-tinta-fraca">
          {formatarData(v.dataInicio)} → {formatarData(v.dataFim)} · {formatarMoeda(v.valorMensal)}/mês · registrado por {v.criadoPor.nome} em{' '}
          {formatarDataHora(v.criadoEm)}
        </p>
        {v.observacao && <p className="mt-1 text-[12px] text-tinta-fraca">{v.observacao}</p>}
        {v.documento && (
          <p className="mt-1 text-[12px]">
            {v.documento.removido ? (
              <span className="text-tinta-fraca">📎 {v.documento.nome} (documento removido)</span>
            ) : (
              <a href={urlArquivo(v.documento.id)} className="text-marca hover:underline">
                📎 {v.documento.nome}
              </a>
            )}
          </p>
        )}
        {v.anulado && <p className="mt-1 text-[12px] text-status-vencido">Anulado — {v.justificativaAnulacao}</p>}

        {anulando && (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] text-tinta-fraca">
              O aditivo continua no histórico, riscado; a vigência e o valor voltam ao registro anterior.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                autoFocus
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa (ex.: valor digitado errado)"
                className="min-w-[240px] flex-1 rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={justificativa.trim().length < 5 || anular.isPending}
                onClick={async () => {
                  setErro('')
                  try {
                    await anular.mutateAsync({ aditivoId: v.id, versao: contrato.versao, justificativa })
                    setAnulando(false)
                  } catch (e) {
                    setErro(e instanceof ErroDaApi ? e.message : 'Erro inesperado.')
                  }
                }}
                className="rounded-md bg-status-vencido px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                {anular.isPending ? 'Anulando…' : 'Anular aditivo'}
              </button>
              <button type="button" onClick={() => setAnulando(false)} className="text-[12px] text-tinta-fraca hover:text-tinta">
                Cancelar
              </button>
            </div>
            {erro && <p className="text-[12px] text-status-vencido">{erro}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export function AbaHistorico({ contrato }: { contrato: ContratoDetalhe }) {
  const [registrando, setRegistrando] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-tinta-fraca">Vigência inicial e aditivos deste contrato. Vigência e valor só mudam por aditivo.</p>
        {contrato.permissoes.registrarAditivo && !registrando && (
          <button
            type="button"
            onClick={() => setRegistrando(true)}
            className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
          >
            + Novo aditivo
          </button>
        )}
      </div>
      {registrando && <FormAditivo contrato={contrato} aoFechar={() => setRegistrando(false)} />}
      {contrato.historico.map((v) => (
        <LinhaVigencia key={v.id} v={v} contrato={contrato} />
      ))}
    </div>
  )
}
