'use client'

import { useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { LinhaObrigacao } from '@/components/LinhaObrigacao'
import { ErroDaApi } from '@/lib/api/cliente'
import { useCriarObrigacao, useObrigacoesDoContrato } from '@/lib/api/obrigacoes'
import type { ContratoDetalhe } from '@/lib/shared/contratos'
import { RECORRENCIAS, type Recorrencia } from '@/lib/shared/obrigacoes'

/**
 * Aba Obrigações: pagamentos, seguros, avisos e demais compromissos do
 * contrato. Mensal/Anual: ao cumprir, a próxima ocorrência é gerada sozinha
 * enquanto couber na vigência.
 */

const classeInput =
  'rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

function NovaObrigacao({ contratoId }: { contratoId: string }) {
  const vazio = { descricao: '', responsavel: '', data: '', recorrencia: 'Única' as Recorrencia }
  const [f, setF] = useState(vazio)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState('')
  const criar = useCriarObrigacao(contratoId)

  async function salvar() {
    setErros({})
    setAviso('')
    try {
      const r = await criar.mutateAsync(f)
      setF(vazio)
      if (r.avisos.length) setAviso(r.avisos.join(' '))
    } catch (e) {
      setErros(e instanceof ErroDaApi ? (Object.keys(e.campos).length ? e.campos : { geral: e.message }) : { geral: 'Erro inesperado.' })
    }
  }

  const erro = Object.values(erros)[0]
  return (
    <div className="border-b border-borda p-3">
      <div className="flex flex-wrap items-end gap-2">
        <input value={f.descricao} onChange={(e) => setF((v) => ({ ...v, descricao: e.target.value }))} placeholder="Descrição (ex.: pagamento até o dia 10)" className={`${classeInput} min-w-[220px] flex-1`} />
        <input value={f.responsavel} onChange={(e) => setF((v) => ({ ...v, responsavel: e.target.value }))} placeholder="Responsável (área ou pessoa)" className={`${classeInput} w-48`} />
        <input type="date" value={f.data} onChange={(e) => setF((v) => ({ ...v, data: e.target.value }))} className={classeInput} aria-label="Vencimento" />
        <select value={f.recorrencia} onChange={(e) => setF((v) => ({ ...v, recorrencia: e.target.value as Recorrencia }))} className={classeInput} aria-label="Recorrência">
          {RECORRENCIAS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button type="button" onClick={salvar} disabled={criar.isPending} className="rounded-md bg-marca px-3 py-1.5 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40">
          {criar.isPending ? 'Salvando…' : '+ Adicionar'}
        </button>
      </div>
      {erro && <p className="mt-1 text-[11px] text-status-vencido">{erro}</p>}
      {aviso && <p className="mt-1 text-[11px] text-status-atencao">{aviso}</p>}
    </div>
  )
}

export function AbaObrigacoes({ contrato }: { contrato: ContratoDetalhe }) {
  const { data, isPending, error, refetch } = useObrigacoesDoContrato(contrato.id)
  return (
    <div className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}>
      {contrato.permissoes.editar && <NovaObrigacao contratoId={contrato.id} />}
      {contrato.encerramento && (
        <p className="border-b border-borda px-4 py-2 text-[12px] text-tinta-fraca">
          Contrato encerrado: dá para cumprir ou cancelar o que ficou pendente, mas não criar obrigações novas.
        </p>
      )}
      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Descrição</th>
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Recorrência</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <LinhaObrigacao key={o.id} o={o} podeEditar={contrato.permissoes.editar} />
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-tinta-fraca">
                    Nenhuma obrigação cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
