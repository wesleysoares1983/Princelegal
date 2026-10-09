'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'
import { useEncerrarContrato, useReabrirContrato, useRenovarContrato } from '@/lib/api/contratos'
import { problemaNoArquivo } from '@/lib/api/documentos'
import type { ContratoDetalhe } from '@/lib/shared/contratos'
import { hojeSP, somarAnos, somarDias } from '@/lib/shared/datas'
import { EXTENSOES_ACEITAS } from '@/lib/shared/documentos'

/** Moldura comum dos dois modais. */
function Modal({ titulo, children, aoFechar }: { titulo: string; children: React.ReactNode; aoFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={aoFechar}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl border border-borda bg-painel p-5 shadow-2xl">
        <h2 className="text-[15px] font-semibold text-tinta">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

const classeInput =
  'mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

function mensagem(erro: unknown): string {
  if (erro instanceof ErroDaApi) return Object.values(erro.campos)[0] ?? erro.message
  return 'Erro inesperado. Tente novamente.'
}

/**
 * Encerrar (só administrador). Registra algo que já aconteceu: a data vai de
 * hoje para trás, até o início do contrato. Contrato nunca é excluído.
 */
export function ModalEncerrar({ contrato, aoFechar }: { contrato: ContratoDetalhe; aoFechar: () => void }) {
  const hoje = hojeSP()
  const [data, setData] = useState(hoje)
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const encerrar = useEncerrarContrato(contrato.id)

  async function confirmar() {
    setErro('')
    try {
      await encerrar.mutateAsync({ versao: contrato.versao, data, justificativa })
      aoFechar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <Modal titulo="Encerrar contrato" aoFechar={aoFechar}>
      <p className="text-[12px] text-tinta-fraca">
        O contrato sai dos ativos e dos alertas e fica somente leitura. Ele continua no histórico e na auditoria — não é possível excluí-lo.
      </p>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Data do encerramento</span>
        <input type="date" value={data} min={contrato.dataInicio} max={hoje} onChange={(e) => setData(e.target.value)} className={classeInput} />
      </label>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Justificativa</span>
        <textarea
          rows={3}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: serviço descontinuado, distrato assinado em…"
          className={`${classeInput} resize-none`}
        />
      </label>
      {erro && (
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
          onClick={confirmar}
          disabled={encerrar.isPending || justificativa.trim().length < 5}
          className="rounded-md bg-status-vencido px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {encerrar.isPending ? 'Encerrando…' : 'Encerrar contrato'}
        </button>
      </div>
    </Modal>
  )
}

/** Reabrir um encerramento manual (só administrador, com justificativa). */
export function ModalReabrir({ contrato, aoFechar }: { contrato: ContratoDetalhe; aoFechar: () => void }) {
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const reabrir = useReabrirContrato(contrato.id)

  async function confirmar() {
    setErro('')
    try {
      await reabrir.mutateAsync({ versao: contrato.versao, justificativa })
      aoFechar()
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  return (
    <Modal titulo="Reabrir contrato" aoFechar={aoFechar}>
      <p className="text-[12px] text-tinta-fraca">
        Desfaz o encerramento: o contrato volta a contar nos ativos e nos alertas. O encerramento desfeito continua registrado na auditoria.
      </p>
      <label className="block">
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Justificativa</span>
        <textarea
          rows={3}
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Ex.: encerrado por engano"
          className={`${classeInput} resize-none`}
        />
      </label>
      {erro && (
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
          onClick={confirmar}
          disabled={reabrir.isPending || justificativa.trim().length < 5}
          className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40"
        >
          {reabrir.isPending ? 'Reabrindo…' : 'Reabrir contrato'}
        </button>
      </div>
    </Modal>
  )
}

/**
 * Renovar = cadastrar o contrato seguinte, ligado a este (D7). Pré-preenche
 * a continuação natural: começa no dia seguinte ao término atual, dura um
 * ano, mesmo valor. Todo o resto é copiado e pode ser ajustado depois no novo.
 * Este contrato fica encerrado como "Renovado por CTR-…".
 */
export function ModalRenovar({ contrato, aoFechar }: { contrato: ContratoDetalhe; aoFechar: () => void }) {
  const router = useRouter()
  const inicio = somarDias(contrato.dataFim, 1)
  const [f, setF] = useState({
    nome: contrato.nome,
    dataInicio: inicio,
    dataFim: somarDias(somarAnos(inicio, 1), -1),
    valorMensal: String(contrato.valorMensal).replace('.', ','),
    dataBaseReajuste: inicio,
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState('')
  const renovar = useRenovarContrato(contrato.id)

  async function confirmar() {
    setErro('')
    const t = f.valorMensal.trim()
    const valor = t ? Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) : undefined
    try {
      const novo = await renovar.mutateAsync({
        dados: { versao: contrato.versao, nome: f.nome, dataInicio: f.dataInicio, dataFim: f.dataFim, valorMensal: valor, dataBaseReajuste: f.dataBaseReajuste },
        arquivo,
      })
      router.push(`/contratos/${novo.id}`)
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const campo = (k: keyof typeof f, rotulo: string, tipo = 'text') => (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</span>
      <input type={tipo} value={f[k]} onChange={(e) => setF((v) => ({ ...v, [k]: e.target.value }))} className={classeInput} />
    </label>
  )

  return (
    <Modal titulo="Renovar contrato" aoFechar={aoFechar}>
      <p className="text-[12px] text-tinta-fraca">
        Cria o contrato seguinte, com novo código, copiando fornecedor, responsáveis e demais dados. Este ({contrato.codigo}) fica encerrado como
        renovado, com seus documentos e histórico.
      </p>
      {campo('nome', 'Nome do novo contrato')}
      <div className="grid grid-cols-2 gap-3">
        {campo('dataInicio', 'Início', 'date')}
        {campo('dataFim', 'Término', 'date')}
        {campo('valorMensal', 'Valor mensal (R$)')}
        {campo('dataBaseReajuste', 'Data-base de reajuste', 'date')}
      </div>
      <label className="block cursor-pointer">
        <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Renovação assinada (PDF ou Word, opcional)</span>
        <span className={`${classeInput} block truncate`}>{arquivo ? arquivo.name : 'Escolher arquivo…'}</span>
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
      {erro && (
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
          onClick={confirmar}
          disabled={renovar.isPending}
          className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40"
        >
          {renovar.isPending ? 'Renovando…' : 'Renovar'}
        </button>
      </div>
    </Modal>
  )
}
