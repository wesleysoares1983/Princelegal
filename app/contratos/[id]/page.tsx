'use client'

import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'
import { useState } from 'react'
import { SeloStatus } from '@/components/SeloStatus'
import { buscarContrato } from '@/lib/contratos'
import { avaliarContrato, formatarData, formatarMoeda, proximoReajuste } from '@/lib/status'
import type { RegistroHistorico } from '@/lib/tipos'

const ABAS = [
  'Identificação',
  'Vigência',
  'Financeiro',
  'Responsabilidade',
  'Obrigações',
  'Documentos',
  'Histórico',
  'Auditoria',
] as const
type Aba = (typeof ABAS)[number]

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</p>
      <p className="mt-0.5 text-[13px] text-tinta">{valor}</p>
    </div>
  )
}

export default function DetalheContrato() {
  const { id } = useParams<{ id: string }>()
  const contratoBase = buscarContrato(id)
  const [aba, setAba] = useState<Aba>('Identificação')
  // Encerrar so muda o status calculado -- o registro do contrato continua
  // existindo e visivel, nunca some da lista nem do historico. Sem backend
  // ainda, isto fica local a tela; ao ganhar API vira uma chamada de verdade.
  const [encerradoLocalEm, setEncerradoLocalEm] = useState<string | undefined>(undefined)

  // Aditivo: mesma ideia do encerramento -- entra na aba Historico e, sendo o
  // registro mais recente, passa a valer como a vigencia e o valor atuais do
  // contrato (e por isso entram no calculo de status/vencimento tambem).
  const [aditivosLocais, setAditivosLocais] = useState<RegistroHistorico[]>([])
  const [aditivoAberto, setAditivoAberto] = useState(false)
  const [aditivo, setAditivo] = useState({ dataInicio: '', dataFim: '', valorMensal: '', observacao: '' })
  const [erroAditivo, setErroAditivo] = useState('')

  if (!contratoBase) notFound()

  const historico = [...contratoBase.historico, ...aditivosLocais]
  const ultimoRegistro = historico[historico.length - 1]
  const contrato = {
    ...contratoBase,
    encerradoEm: contratoBase.encerradoEm ?? encerradoLocalEm,
    dataFim: ultimoRegistro?.dataFim ?? contratoBase.dataFim,
    valorMensal: ultimoRegistro?.valorMensal ?? contratoBase.valorMensal,
    historico,
  }
  const av = avaliarContrato(contrato)
  const reajuste = proximoReajuste(contrato.dataBaseReajuste)

  function encerrar() {
    if (!confirm('Encerrar este contrato? Ele continua no histórico e na auditoria — não é possível excluí-lo.')) return
    setEncerradoLocalEm(new Date().toISOString().slice(0, 10))
  }

  function abrirAditivo() {
    setAditivo({ dataInicio: contrato.dataInicio, dataFim: contrato.dataFim, valorMensal: String(contrato.valorMensal), observacao: '' })
    setErroAditivo('')
    setAditivoAberto(true)
  }

  function registrarAditivo() {
    if (!aditivo.dataInicio || !aditivo.dataFim || !aditivo.valorMensal) {
      setErroAditivo('Preencha início, término e o novo valor mensal.')
      return
    }
    const valor = Number(aditivo.valorMensal.replace(',', '.'))
    if (Number.isNaN(valor) || valor < 0) {
      setErroAditivo('Informe um valor mensal válido.')
      return
    }
    setAditivosLocais((atual) => [
      ...atual,
      {
        id: `aditivo-local-${atual.length + 1}`,
        tipo: 'Aditivo',
        dataInicio: aditivo.dataInicio,
        dataFim: aditivo.dataFim,
        valorMensal: valor,
        observacao: aditivo.observacao.trim() || undefined,
      },
    ])
    setAditivoAberto(false)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/contratos" className="text-[12px] text-tinta-fraca hover:text-tinta">
            ← Contratos
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-tinta">{contrato.nome}</h1>
          <p className="font-mono text-[12px] text-tinta-fraca">{contrato.codigo}</p>
        </div>
        <div className="flex items-center gap-2">
          <SeloStatus status={av.status} rotulo={av.rotulo} />
          {av.status !== 'encerrado' && (
            <button
              onClick={encerrar}
              className="rounded-md border border-borda px-3 py-2 text-[12px] font-semibold text-tinta-fraca hover:border-status-vencido/50 hover:text-status-vencido"
              title="Marca o contrato como inativo. Não é possível excluí-lo — ele permanece no histórico e na auditoria."
            >
              Encerrar contrato
            </button>
          )}
          <button
            disabled={av.status === 'encerrado'}
            className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Renovar contrato
          </button>
        </div>
      </div>

      {av.decisaoUrgente && (
        <div
          className="grad-quadro rounded-lg border px-4 py-3 text-[12px] text-status-alerta"
          style={{ '--cor-quadro': 'var(--status-alerta)' } as React.CSSProperties}
        >
          ⚠️ Faltam {av.diasDecisao} dia{av.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação sobre renovação/cancelamento
          (aviso prévio de {contrato.prazoAvisoCancelamentoDias} dias).
        </div>
      )}

      {contrato.acaoVencimento && (
        <div
          className="grad-quadro rounded-lg border px-4 py-3"
          style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}
        >
          <p className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Ação para o vencimento</p>
          <p className="mt-1 text-[13px] text-tinta">
            <span className="font-semibold">{contrato.acaoVencimento}</span>
            {contrato.responsavelAcao && <> · responsável {contrato.responsavelAcao}</>}
            {contrato.prazoAcao && <> · prazo {formatarData(contrato.prazoAcao)}</>}
            {contrato.statusAcao && <> · {contrato.statusAcao}</>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-borda">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded-t-md px-3 py-2 text-[12px] font-medium transition-colors ${
              aba === a ? 'border-b-2 border-marca text-tinta' : 'text-tinta-fraca hover:text-tinta'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {aba === 'Identificação' && (
        <div
          className="grad-quadro grid grid-cols-2 gap-5 rounded-xl border p-5 sm:grid-cols-3"
          style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
        >
          <Campo rotulo="Categoria" valor={contrato.categoria} />
          <Campo rotulo="Fornecedor / Contraparte" valor={contrato.fornecedorNome} />
          <Campo rotulo="CNPJ / CPF" valor={contrato.fornecedorDocumento} />
          <Campo rotulo="Contato" valor={contrato.fornecedorContato ?? '—'} />
          <Campo rotulo="Empresa" valor={contrato.empresa} />
          <Campo rotulo="Filial" valor={contrato.filial} />
          <div className="col-span-full">
            <Campo rotulo="Objeto do contrato" valor={contrato.objeto} />
          </div>
        </div>
      )}

      {aba === 'Vigência' && (
        <div
          className="grad-quadro grid grid-cols-2 gap-5 rounded-xl border p-5 sm:grid-cols-3"
          style={{ '--cor-quadro': 'var(--status-renovado)' } as React.CSSProperties}
        >
          <Campo rotulo="Data de início" valor={formatarData(contrato.dataInicio)} />
          <Campo rotulo="Data de término" valor={formatarData(contrato.dataFim)} />
          <Campo rotulo="Dias até o vencimento" valor={av.diasVencimento} />
          <Campo rotulo="Renovação automática" valor={contrato.renovacaoAutomatica ? 'Sim' : 'Não'} />
          <Campo rotulo="Prazo para aviso de cancelamento" valor={`${contrato.prazoAvisoCancelamentoDias} dias antes`} />
          <Campo
            rotulo="Prazo-limite de decisão"
            valor={
              av.diasDecisao >= 0
                ? `em ${av.diasDecisao} dia${av.diasDecisao === 1 ? '' : 's'}`
                : `passou há ${Math.abs(av.diasDecisao)} dia${Math.abs(av.diasDecisao) === 1 ? '' : 's'}`
            }
          />
        </div>
      )}

      {aba === 'Financeiro' && (
        <div
          className="grad-quadro grid grid-cols-2 gap-5 rounded-xl border p-5 sm:grid-cols-3"
          style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
        >
          <Campo rotulo="Valor mensal" valor={formatarMoeda(contrato.valorMensal)} />
          <Campo rotulo="Valor anual" valor={formatarMoeda(contrato.valorMensal * 12)} />
          <Campo rotulo="Forma de pagamento" valor={contrato.formaPagamento} />
          <Campo rotulo="Centro de custo" valor={contrato.centroCusto} />
          <Campo rotulo="Índice de reajuste" valor={contrato.indiceReajuste} />
          <Campo rotulo="Próximo reajuste" valor={formatarData(reajuste)} />
        </div>
      )}

      {aba === 'Responsabilidade' && (
        <div
          className="grad-quadro grid grid-cols-2 gap-5 rounded-xl border p-5 sm:grid-cols-3"
          style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
        >
          <Campo rotulo="Área responsável" valor={contrato.areaResponsavel} />
          <Campo rotulo="Gestor do contrato" valor={contrato.gestor} />
          <Campo rotulo="Responsável jurídico" valor={contrato.responsavelJuridico} />
          <Campo rotulo="Acesso restrito" valor={contrato.acessoRestrito ? '🔒 Sim' : 'Não'} />
        </div>
      )}

      {aba === 'Obrigações' && (
        <div
          className="grad-quadro overflow-hidden rounded-xl border"
          style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}
        >
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Descrição</th>
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Recorrência</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contrato.obrigacoes.map((o) => (
                <tr key={o.id} className="border-t border-borda">
                  <td className="px-4 py-2 text-tinta">{o.descricao}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{o.responsavel}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{formatarData(o.data)}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{o.recorrencia}</td>
                  <td className="px-4 py-2">
                    <span className={o.cumprida ? 'text-status-vigente' : 'text-status-atencao'}>
                      {o.cumprida ? '✓ Cumprida' : '● Pendente'}
                    </span>
                  </td>
                </tr>
              ))}
              {contrato.obrigacoes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-tinta-fraca">
                    Nenhuma obrigação cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'Documentos' && (
        <div
          className="grad-quadro overflow-hidden rounded-xl border"
          style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}
        >
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Versão</th>
                <th className="px-4 py-2 font-medium">Enviado em</th>
                <th className="px-4 py-2 font-medium">Por</th>
              </tr>
            </thead>
            <tbody>
              {contrato.documentos.map((d) => (
                <tr key={d.id} className="border-t border-borda">
                  <td className="px-4 py-2 text-tinta">{d.nome}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{d.tipo}</td>
                  <td className="px-4 py-2 text-tinta-fraca">v{d.versao}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{formatarData(d.enviadoEm)}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{d.enviadoPor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'Histórico' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-tinta-fraca">
              Original, aditivos e renovações registrados neste contrato.
            </p>
            {!aditivoAberto && av.status !== 'encerrado' && (
              <button
                type="button"
                onClick={abrirAditivo}
                className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
              >
                + Novo aditivo
              </button>
            )}
          </div>

          {aditivoAberto && (
            <div
              className="grad-quadro space-y-3 rounded-xl border p-4"
              style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}
            >
              <p className="text-[13px] font-semibold text-tinta">Vincular aditivo de contrato</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Nova vigência — início</span>
                  <input
                    type="date"
                    value={aditivo.dataInicio}
                    onChange={(e) => setAditivo((a) => ({ ...a, dataInicio: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta focus:border-marca/60 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Nova vigência — término</span>
                  <input
                    type="date"
                    value={aditivo.dataFim}
                    onChange={(e) => setAditivo((a) => ({ ...a, dataFim: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta focus:border-marca/60 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Novo valor mensal (R$)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={aditivo.valorMensal}
                    onChange={(e) => setAditivo((a) => ({ ...a, valorMensal: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta focus:border-marca/60 focus:outline-none"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Observação</span>
                <input
                  value={aditivo.observacao}
                  onChange={(e) => setAditivo((a) => ({ ...a, observacao: e.target.value }))}
                  placeholder="Ex.: Reajuste anual, prorrogação de prazo…"
                  className="mt-1 w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
                />
              </label>
              {erroAditivo && <p className="text-[12px] text-status-vencido">{erroAditivo}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAditivoAberto(false)}
                  className="rounded-md border border-borda px-3 py-2 text-[12px] text-tinta-fraca hover:text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={registrarAditivo}
                  className="rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
                >
                  Vincular aditivo
                </button>
              </div>
            </div>
          )}

          {contrato.historico.map((h, i) => (
            <div
              key={h.id}
              className="grad-quadro flex items-start gap-3 rounded-xl border p-4"
              style={{ '--cor-quadro': 'var(--status-renovado)' } as React.CSSProperties}
            >
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-marca" />
              <div>
                <p className="text-[13px] font-semibold text-tinta">
                  {h.tipo} {i > 0 && `(${i})`}
                </p>
                <p className="text-[12px] text-tinta-fraca">
                  {formatarData(h.dataInicio)} → {formatarData(h.dataFim)} · {formatarMoeda(h.valorMensal)}/mês
                </p>
                {h.observacao && <p className="mt-1 text-[12px] text-tinta-fraca">{h.observacao}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 'Auditoria' && (
        <div
          className="grad-quadro overflow-hidden rounded-xl border"
          style={{ '--cor-quadro': 'var(--status-encerrado)' } as React.CSSProperties}
        >
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Usuário</th>
                <th className="px-4 py-2 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {contrato.auditoria.map((e) => (
                <tr key={e.id} className="border-t border-borda">
                  <td className="px-4 py-2 text-tinta-fraca">{formatarData(e.data)}</td>
                  <td className="px-4 py-2 text-tinta">{e.usuario}</td>
                  <td className="px-4 py-2 text-tinta-fraca">{e.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
