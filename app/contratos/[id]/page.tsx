'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { SeloStatus } from '@/components/SeloStatus'
import { ErroDaApi } from '@/lib/api/cliente'
import { useAuditoriaDoContrato, useContrato } from '@/lib/api/contratos'
import type { ContratoDetalhe } from '@/lib/shared/contratos'
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/shared/status'
import { AbaDocumentos } from './AbaDocumentos'
import { AbaHistorico } from './AbaHistorico'
import { AbaObrigacoes } from './AbaObrigacoes'
import { EdicaoContrato } from './EdicaoContrato'
import { ModalEncerrar, ModalReabrir, ModalRenovar } from './Modais'

const ABAS = ['Identificação', 'Vigência', 'Financeiro', 'Responsabilidade', 'Obrigações', 'Documentos', 'Histórico', 'Auditoria'] as const
type Aba = (typeof ABAS)[number]


function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">{rotulo}</p>
      <p className="mt-0.5 text-[13px] text-tinta">{valor}</p>
    </div>
  )
}

function Quadro({ cor, children, grade = true }: { cor: string; children: React.ReactNode; grade?: boolean }) {
  return (
    <div
      className={`grad-quadro rounded-xl border p-5 ${grade ? 'grid grid-cols-2 gap-5 sm:grid-cols-3' : ''}`}
      style={{ '--cor-quadro': `var(${cor})` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

/** Opção desativada depois do cadastro continua valendo no contrato -- e a tela diz isso. */
const nomeOpcao = (o: { valor: string; ativo: boolean }) => (o.ativo ? o.valor : `${o.valor} (inativa)`)

export default function DetalheContrato() {
  const { id } = useParams<{ id: string }>()
  const { data: contrato, isPending, error, refetch } = useContrato(id)

  if (error instanceof ErroDaApi && error.status === 404) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <Link href="/contratos" className="text-[12px] text-tinta-fraca hover:text-tinta">
          ← Contratos
        </Link>
        <p className="text-[13px] text-tinta-fraca">Contrato não encontrado.</p>
      </div>
    )
  }
  if (!contrato) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
      </div>
    )
  }
  return <Detalhe contrato={contrato} />
}

function Detalhe({ contrato }: { contrato: ContratoDetalhe }) {
  const [aba, setAba] = useState<Aba>('Identificação')
  const [editando, setEditando] = useState(false)
  const [modal, setModal] = useState<'encerrar' | 'reabrir' | 'renovar' | null>(null)
  const [paginaAuditoria, setPaginaAuditoria] = useState(1)
  const auditoria = useAuditoriaDoContrato(contrato.id, paginaAuditoria, aba === 'Auditoria')

  const av = contrato.avaliacao
  const p = contrato.permissoes

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/contratos" className="text-[12px] text-tinta-fraca hover:text-tinta">
            ← Contratos
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-tinta">
            {contrato.nome}
            {contrato.acessoRestrito && (
              <span className="ml-2 text-[12px]" title="Acesso restrito: só administradores, o gestor e o responsável jurídico">
                🔒
              </span>
            )}
          </h1>
          <p className="font-mono text-[12px] text-tinta-fraca">{contrato.codigo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeloStatus status={av.status} rotulo={av.rotulo} />
          {p.editar && !editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-borda px-3 py-2 text-[12px] font-semibold text-tinta-fraca hover:text-tinta"
            >
              Editar
            </button>
          )}
          {p.encerrar && (
            <button
              type="button"
              onClick={() => setModal('encerrar')}
              className="rounded-md border border-borda px-3 py-2 text-[12px] font-semibold text-tinta-fraca hover:border-status-vencido/50 hover:text-status-vencido"
              title="Marca o contrato como encerrado. Não é possível excluí-lo — ele permanece no histórico e na auditoria."
            >
              Encerrar contrato
            </button>
          )}
          {p.reabrir && (
            <button
              type="button"
              onClick={() => setModal('reabrir')}
              className="rounded-md border border-borda px-3 py-2 text-[12px] font-semibold text-tinta-fraca hover:text-tinta"
            >
              Reabrir
            </button>
          )}
          {p.renovar && (
            <button
              type="button"
              onClick={() => setModal('renovar')}
              className="rounded-md bg-marca px-3 py-2 text-[12px] font-semibold text-marca-tinta hover:opacity-90"
            >
              Renovar contrato
            </button>
          )}
        </div>
      </div>

      {contrato.encerramento && (
        <div className="grad-quadro rounded-lg border px-4 py-3 text-[12px]" style={{ '--cor-quadro': 'var(--status-encerrado)' } as React.CSSProperties}>
          <p className="text-tinta">
            {contrato.encerramento.motivo === 'renovado' ? 'Renovado' : 'Encerrado'} em {formatarData(contrato.encerramento.data)}
            {contrato.encerramento.por && <> por {contrato.encerramento.por.nome}</>}
            {contrato.renovadoPor && (
              <>
                {' '}
                —{' '}
                <Link href={`/contratos/${contrato.renovadoPor.id}`} className="font-mono text-marca hover:underline">
                  {contrato.renovadoPor.codigo}
                </Link>
              </>
            )}
          </p>
          {contrato.encerramento.justificativa && <p className="mt-0.5 text-tinta-fraca">{contrato.encerramento.justificativa}</p>}
        </div>
      )}

      {contrato.renova && (
        <p className="text-[12px] text-tinta-fraca">
          Renovação de{' '}
          <Link href={`/contratos/${contrato.renova.id}`} className="font-mono text-marca hover:underline">
            {contrato.renova.codigo}
          </Link>
        </p>
      )}

      {av.decisaoUrgente && (
        <div className="grad-quadro rounded-lg border px-4 py-3 text-[12px] text-status-alerta" style={{ '--cor-quadro': 'var(--status-alerta)' } as React.CSSProperties}>
          ⚠️{' '}
          {av.diasDecisao >= 0
            ? `Faltam ${av.diasDecisao} dia${av.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação sobre renovação/cancelamento`
            : `O prazo-limite de manifestação sobre renovação/cancelamento passou há ${-av.diasDecisao} dia${av.diasDecisao === -1 ? '' : 's'}`}{' '}
          ({formatarData(contrato.dataLimiteAviso)}; aviso prévio de {contrato.prazoAvisoCancelamentoDias} dias).
        </div>
      )}

      {contrato.acaoVencimento && (
        <div className="grad-quadro rounded-lg border px-4 py-3" style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}>
          <p className="text-[11px] uppercase tracking-[0.05em] text-tinta-fraca">Ação para o vencimento</p>
          <p className="mt-1 text-[13px] text-tinta">
            <span className="font-semibold">{contrato.acaoVencimento.acao}</span> · responsável {contrato.acaoVencimento.responsavel} · prazo{' '}
            {formatarData(contrato.acaoVencimento.prazo)} · {contrato.acaoVencimento.status}
          </p>
        </div>
      )}

      {editando ? (
        <EdicaoContrato contrato={contrato} aoTerminar={() => setEditando(false)} />
      ) : (
        <>
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
            <Quadro cor="--marca">
              <Campo rotulo="Categoria" valor={nomeOpcao(contrato.categoria)} />
              <Campo rotulo="Segmento" valor={nomeOpcao(contrato.segmento)} />
              <Campo rotulo="Fornecedor / Contraparte" valor={contrato.fornecedorNome} />
              <Campo rotulo="CNPJ / CPF" valor={contrato.fornecedorDocumento} />
              <Campo rotulo="Contato" valor={contrato.fornecedorContato ?? '—'} />
              <Campo rotulo="Empresa" valor={nomeOpcao(contrato.empresa)} />
              <Campo rotulo="Filial" valor={nomeOpcao(contrato.filial)} />
              <div className="col-span-full">
                <Campo rotulo="Objeto do contrato" valor={contrato.objeto} />
              </div>
              {contrato.observacoes && (
                <div className="col-span-full">
                  <Campo rotulo="Observações" valor={contrato.observacoes} />
                </div>
              )}
            </Quadro>
          )}

          {aba === 'Vigência' && (
            <Quadro cor="--status-renovado">
              <Campo rotulo="Data de início" valor={formatarData(contrato.dataInicio)} />
              <Campo rotulo="Data de término" valor={formatarData(contrato.dataFim)} />
              <Campo rotulo="Dias até o vencimento" valor={av.diasVencimento} />
              <Campo rotulo="Renovação automática" valor={contrato.renovacaoAutomatica ? 'Sim (o sistema só alerta; registre a renovação)' : 'Não'} />
              <Campo rotulo="Prazo para aviso de cancelamento" valor={`${contrato.prazoAvisoCancelamentoDias} dias antes`} />
              <Campo
                rotulo="Prazo-limite de decisão"
                valor={`${formatarData(contrato.dataLimiteAviso)} (${
                  av.diasDecisao >= 0 ? `em ${av.diasDecisao} dia${av.diasDecisao === 1 ? '' : 's'}` : `passou há ${-av.diasDecisao} dia${av.diasDecisao === -1 ? '' : 's'}`
                })`}
              />
            </Quadro>
          )}

          {aba === 'Financeiro' && (
            <Quadro cor="--marca">
              <Campo rotulo="Valor mensal" valor={formatarMoeda(contrato.valorMensal)} />
              <Campo rotulo="Valor anual" valor={formatarMoeda(contrato.valorAnual)} />
              <Campo rotulo="Forma de pagamento" valor={contrato.formaPagamento} />
              <Campo rotulo="Centro de custo" valor={nomeOpcao(contrato.centroCusto)} />
              <Campo rotulo="Índice de reajuste" valor={contrato.indiceReajuste} />
              <Campo rotulo="Próximo reajuste" valor={formatarData(contrato.proximoReajuste)} />
              <Campo rotulo="Multa de rescisão" valor={contrato.multaRescisao === null ? '—' : formatarMoeda(contrato.multaRescisao)} />
            </Quadro>
          )}

          {aba === 'Responsabilidade' && (
            <Quadro cor="--marca">
              <Campo rotulo="Área responsável" valor={nomeOpcao(contrato.areaResponsavel)} />
              <Campo rotulo="Gestor do contrato" valor={`${contrato.gestorNome} · ${contrato.gestorEmail}`} />
              <Campo rotulo="Responsável jurídico" valor={`${contrato.responsavelJuridicoNome} · ${contrato.responsavelJuridicoEmail}`} />
              <Campo rotulo="Acesso restrito" valor={contrato.acessoRestrito ? '🔒 Sim' : 'Não'} />
              <Campo rotulo="Cadastrado por" valor={`${contrato.criadoPor.nome} em ${formatarDataHora(contrato.criadoEm)}`} />
            </Quadro>
          )}

          {aba === 'Obrigações' && <AbaObrigacoes contrato={contrato} />}

          {aba === 'Documentos' && <AbaDocumentos contrato={contrato} />}

          {aba === 'Histórico' && <AbaHistorico contrato={contrato} />}

          {aba === 'Auditoria' && (
            <div className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--status-encerrado)' } as React.CSSProperties}>
              <EstadoConsulta carregando={auditoria.isPending} erro={auditoria.error} tentarDeNovo={auditoria.refetch} />
              {auditoria.data && (
                <>
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="text-tinta-fraca">
                        <th className="px-4 py-2 font-medium">Quando</th>
                        <th className="px-4 py-2 font-medium">Usuário</th>
                        <th className="px-4 py-2 font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditoria.data.itens.map((e) => (
                        <tr key={e.id} className="border-t border-borda align-top">
                          <td className="whitespace-nowrap px-4 py-2 text-tinta-fraca">{formatarDataHora(e.ocorridoEm)}</td>
                          <td className="px-4 py-2">{e.usuario ? <span className="text-tinta">{e.usuario.nome}</span> : <span className="italic text-tinta-fraca">Sistema</span>}</td>
                          <td className="px-4 py-2 text-tinta-fraca">{e.descricao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditoria.data.total > auditoria.data.porPagina && (
                    <div className="flex items-center justify-end gap-2 border-t border-borda px-4 py-2 text-[12px] text-tinta-fraca">
                      <button type="button" disabled={paginaAuditoria <= 1} onClick={() => setPaginaAuditoria((n) => n - 1)} className="disabled:opacity-40">
                        ← Anterior
                      </button>
                      <span>
                        {paginaAuditoria} / {Math.ceil(auditoria.data.total / auditoria.data.porPagina)}
                      </span>
                      <button
                        type="button"
                        disabled={paginaAuditoria * auditoria.data.porPagina >= auditoria.data.total}
                        onClick={() => setPaginaAuditoria((n) => n + 1)}
                        className="disabled:opacity-40"
                      >
                        Próxima →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {modal === 'encerrar' && <ModalEncerrar contrato={contrato} aoFechar={() => setModal(null)} />}
      {modal === 'reabrir' && <ModalReabrir contrato={contrato} aoFechar={() => setModal(null)} />}
      {modal === 'renovar' && <ModalRenovar contrato={contrato} aoFechar={() => setModal(null)} />}
    </div>
  )
}
