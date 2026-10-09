'use client'

import Link from 'next/link'
import { useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { useUsuario } from '@/components/ProvedorUsuario'
import { SeloStatus } from '@/components/SeloStatus'
import { ErroDaApi } from '@/lib/api/cliente'
import { useAlertas, useExecutarAlertas, type ResultadoAlertasTela } from '@/lib/api/contratos'
import { formatarData, formatarDataHora } from '@/lib/shared/status'

/**
 * Fila de alertas: tudo que pede atenção hoje, do mais urgente para o menos.
 *
 * Vencido primeiro (já passou da data), depois vencimento iminente e prazo de
 * decisão -- o mesmo critério do e-mail diário, enviado às 7h ao gestor e ao
 * responsável jurídico. Cada item mostra quando foi o último e-mail.
 */

const ROTULO_TIPO = { vencimento: 'vencimento', prazo_aviso: 'prazo de aviso', vencido: 'fora da vigência' } as const

/** Admin: simular ou rodar agora a rotina diária de e-mails. */
function PainelAdmin() {
  const executar = useExecutarAlertas()
  const [resultado, setResultado] = useState<ResultadoAlertasTela | null>(null)
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  async function rodar(simular: boolean) {
    setErro('')
    setConfirmando(false)
    try {
      setResultado(await executar.mutateAsync(simular))
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Erro inesperado.')
    }
  }

  return (
    <div className="grad-quadro space-y-2 rounded-xl border p-4 text-[12px]" style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-tinta-fraca">E-mails de alerta: enviados todo dia às 7h. Administradores podem conferir ou adiantar o envio de hoje.</p>
        <button type="button" disabled={executar.isPending} onClick={() => rodar(true)} className="rounded-md border border-borda px-3 py-1.5 font-semibold text-tinta hover:bg-painel-2 disabled:opacity-40">
          Simular alertas de hoje
        </button>
        {confirmando ? (
          <>
            <button type="button" onClick={() => rodar(false)} className="rounded-md bg-marca px-3 py-1.5 font-semibold text-marca-tinta">
              Confirmar envio
            </button>
            <button type="button" onClick={() => setConfirmando(false)} className="text-tinta-fraca">
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" disabled={executar.isPending} onClick={() => setConfirmando(true)} className="rounded-md bg-marca px-3 py-1.5 font-semibold text-marca-tinta disabled:opacity-40">
            Enviar agora
          </button>
        )}
      </div>
      {executar.isPending && <p className="text-tinta-fraca">Processando…</p>}
      {erro && <p className="text-status-vencido">{erro}</p>}
      {resultado && (
        <div className="rounded-lg border border-borda bg-painel p-3">
          {resultado.emAndamento ? (
            <p className="text-status-atencao">Outra execução já estava em andamento; tente de novo em instantes.</p>
          ) : (
            <>
              <p className="font-semibold text-tinta">
                {resultado.simulacao ? 'Simulação: seriam enviados' : 'Enviados'} {resultado.enviados.length} e-mail(s)
                {resultado.modo === 'arquivo' && ' — sem servidor SMTP configurado, os e-mails vão para arquivos .eml'}
              </p>
              <ul className="mt-1 space-y-0.5 text-tinta-fraca">
                {resultado.enviados.map((e) => (
                  <li key={e.contratoId}>
                    <span className="font-mono">{e.codigo}</span> {e.nome}: {e.itens.join('; ')} → {e.para.join(', ')}
                  </li>
                ))}
              </ul>
              {resultado.falhas.length > 0 && (
                <p className="mt-1 text-status-vencido">Falhas: {resultado.falhas.map((f) => `${f.codigo} (${f.erro})`).join('; ')}</p>
              )}
              {resultado.desistidos.length > 0 && (
                <p className="mt-1 text-status-vencido">Desistidos após 3 falhas: {resultado.desistidos.map((d) => d.codigo).join(', ')}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Alertas() {
  const admin = useUsuario()?.nivel === 'admin'
  const { data, isPending, error, refetch } = useAlertas()
  const itens = data?.itens ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Alertas</h1>
        <p className="text-[13px] text-tinta-fraca">{data ? `${itens.length} contrato${itens.length === 1 ? '' : 's'} exigindo atenção agora.` : ' '}</p>
      </div>

      {admin && <PainelAdmin />}
      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />

      <div className="space-y-3">
        {itens.map((c) => (
          <div
            key={c.id}
            className="grad-quadro flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            style={{ '--cor-quadro': c.avaliacao.status === 'vencido' ? 'var(--status-vencido)' : 'var(--status-alerta)' } as React.CSSProperties}
          >
            <div>
              <Link href={`/contratos/${c.id}`} className="font-medium text-tinta hover:text-marca">
                {c.nome}
              </Link>
              <p className="text-[12px] text-tinta-fraca">
                {c.fornecedorNome} · vencimento {formatarData(c.dataFim)} · gestor {c.gestorNome}
              </p>
              {c.avaliacao.decisaoUrgente && (
                <p className="mt-1 text-[12px] text-status-alerta">
                  {c.avaliacao.diasDecisao >= 0
                    ? `⚠️ Faltam ${c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === 1 ? '' : 's'} para o prazo-limite de manifestação`
                    : `⚠️ O prazo-limite de manifestação passou há ${-c.avaliacao.diasDecisao} dia${c.avaliacao.diasDecisao === -1 ? '' : 's'}`}
                </p>
              )}
              <p className="mt-1 text-[11px] text-tinta-fraca">
                {c.ultimoAlertaEnviado
                  ? `✉ Último e-mail: ${formatarDataHora(c.ultimoAlertaEnviado.enviadoEm)} (${ROTULO_TIPO[c.ultimoAlertaEnviado.tipo]}${c.ultimoAlertaEnviado.tipo !== 'vencido' ? `, aviso de ${c.ultimoAlertaEnviado.limiarDias} dias` : ''})`
                  : '✉ Nenhum e-mail de alerta enviado ainda'}
              </p>
            </div>
            <SeloStatus status={c.avaliacao.status} rotulo={c.avaliacao.rotulo} />
          </div>
        ))}
        {data && itens.length === 0 && (
          <div className="grad-quadro rounded-xl border p-8 text-center text-tinta-fraca" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
            Nenhum alerta ativo no momento.
          </div>
        )}
      </div>
    </div>
  )
}
