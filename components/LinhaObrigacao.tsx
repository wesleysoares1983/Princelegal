'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useUsuario } from '@/components/ProvedorUsuario'
import { ErroDaApi } from '@/lib/api/cliente'
import { useCancelarObrigacao, useCumprirObrigacao, useDesfazerCumprimento, useEditarObrigacao } from '@/lib/api/obrigacoes'
import { hojeSP } from '@/lib/shared/datas'
import { RECORRENCIAS, type Obrigacao, type Recorrencia } from '@/lib/shared/obrigacoes'
import { formatarData } from '@/lib/shared/status'

/**
 * Uma obrigação numa tabela (aba do contrato ou tela geral), com as ações:
 * cumprir e cancelar (quem vê o contrato, inclusive encerrado), editar (só
 * na aba, contrato aberto) e desfazer cumprimento (quem marcou ou admin).
 */

const classeInput =
  'rounded-md border border-borda bg-painel-2 px-2.5 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const mensagem = (e: unknown) => (e instanceof ErroDaApi ? (Object.values(e.campos)[0] ?? e.message) : 'Erro inesperado. Tente novamente.')

type Painel = 'cumprir' | 'cancelar' | 'editar' | null

export function LinhaObrigacao({ o, mostrarContrato = false, podeEditar = false }: { o: Obrigacao; mostrarContrato?: boolean; podeEditar?: boolean }) {
  const usuario = useUsuario()
  const [painel, setPainel] = useState<Painel>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [cumpridaEm, setCumpridaEm] = useState(hojeSP())
  const [observacao, setObservacao] = useState('')
  const [motivo, setMotivo] = useState('')
  const [edicao, setEdicao] = useState({ descricao: o.descricao, responsavel: o.responsavel, data: o.data, recorrencia: o.recorrencia })

  const cumprir = useCumprirObrigacao()
  const cancelar = useCancelarObrigacao()
  const editar = useEditarObrigacao()
  const desfazer = useDesfazerCumprimento()
  const ocupado = cumprir.isPending || cancelar.isPending || editar.isPending || desfazer.isPending
  const podeDesfazer = o.situacao === 'cumprida' && (usuario?.nivel === 'admin' || o.cumpridaPor?.matricula === usuario?.matricula)

  async function executar(acao: () => Promise<unknown>) {
    setErro('')
    setAviso('')
    try {
      await acao()
      setPainel(null)
    } catch (e) {
      setErro(mensagem(e))
    }
  }

  const colunas = mostrarContrato ? 7 : 6

  return (
    <>
      <tr className={`border-t border-borda align-top ${o.situacao === 'cancelada' ? 'opacity-60' : ''}`}>
        {mostrarContrato && (
          <td className="px-4 py-2">
            <Link href={`/contratos/${o.contrato.id}`} className="font-medium text-tinta hover:text-marca">
              {o.contrato.nome}
            </Link>
            <p className="font-mono text-[11px] text-tinta-fraca">{o.contrato.codigo}</p>
          </td>
        )}
        <td className={`px-4 py-2 text-tinta ${o.situacao === 'cancelada' ? 'line-through' : ''}`}>
          {o.descricao}
          {o.gerada && <span className="ml-1.5 text-[10px] text-tinta-fraca" title="Gerada ao cumprir a ocorrência anterior">↻</span>}
        </td>
        <td className="px-4 py-2 text-tinta-fraca">{o.responsavel}</td>
        <td className={`whitespace-nowrap px-4 py-2 ${o.atrasada ? 'font-semibold text-status-vencido' : 'text-tinta-fraca'}`}>
          {formatarData(o.data)}
          {o.atrasada && <span className="block text-[10px] uppercase">atrasada</span>}
        </td>
        <td className="px-4 py-2 text-tinta-fraca">{o.recorrencia}</td>
        <td className="px-4 py-2 text-[12px]">
          {o.situacao === 'pendente' && <span className="text-status-atencao">● Pendente</span>}
          {o.situacao === 'cumprida' && (
            <span className="text-status-vigente">
              ✓ Cumprida em {formatarData(o.cumpridaEm!)}
              {o.cumpridaPor && <span className="block text-[11px] text-tinta-fraca">{o.cumpridaPor.nome}</span>}
              {o.observacaoCumprimento && <span className="block text-[11px] text-tinta-fraca">{o.observacaoCumprimento}</span>}
            </span>
          )}
          {o.situacao === 'cancelada' && (
            <span className="text-tinta-fraca">
              Cancelada
              {o.motivoCancelamento && <span className="block text-[11px]">{o.motivoCancelamento}</span>}
            </span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] font-semibold">
            {o.situacao === 'pendente' && (
              <>
                <button type="button" onClick={() => setPainel(painel === 'cumprir' ? null : 'cumprir')} className="text-status-vigente hover:underline">
                  Cumprir
                </button>
                {podeEditar && !o.contrato.encerrado && (
                  <button type="button" onClick={() => setPainel(painel === 'editar' ? null : 'editar')} className="text-tinta-fraca hover:text-tinta">
                    Editar
                  </button>
                )}
                <button type="button" onClick={() => setPainel(painel === 'cancelar' ? null : 'cancelar')} className="text-status-vencido hover:underline">
                  Cancelar
                </button>
              </>
            )}
            {podeDesfazer && (
              <button type="button" disabled={ocupado} onClick={() => executar(() => desfazer.mutateAsync(o.id))} className="text-tinta-fraca hover:text-tinta disabled:opacity-40">
                Desfazer
              </button>
            )}
          </div>
          {erro && !painel && <p className="mt-1 text-right text-[11px] text-status-vencido">{erro}</p>}
        </td>
      </tr>

      {painel && (
        <tr className="bg-painel-2/40">
          <td colSpan={colunas} className="px-4 py-2">
            <div className="flex flex-wrap items-end justify-end gap-2">
              {painel === 'cumprir' && (
                <>
                  <label className="flex flex-col gap-0.5 text-[10px] uppercase tracking-[0.05em] text-tinta-fraca">
                    Cumprida em
                    <input type="date" value={cumpridaEm} max={hojeSP()} onChange={(e) => setCumpridaEm(e.target.value)} className={classeInput} />
                  </label>
                  <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação (opcional)" className={`${classeInput} min-w-[200px] flex-1`} />
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      executar(async () => {
                        const r = await cumprir.mutateAsync({ id: o.id, cumpridaEm, observacao })
                        if (r.proxima) setAviso(`Próxima ocorrência gerada para ${formatarData(r.proxima.data)}.`)
                      })
                    }
                    className="rounded-md bg-status-vigente px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Confirmar
                  </button>
                </>
              )}
              {painel === 'cancelar' && (
                <>
                  <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo do cancelamento" className={`${classeInput} min-w-[240px] flex-1`} />
                  <button
                    type="button"
                    disabled={ocupado || motivo.trim().length < 3}
                    onClick={() => executar(() => cancelar.mutateAsync({ id: o.id, motivo }))}
                    className="rounded-md bg-status-vencido px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Cancelar obrigação
                  </button>
                </>
              )}
              {painel === 'editar' && (
                <>
                  <input value={edicao.descricao} onChange={(e) => setEdicao((v) => ({ ...v, descricao: e.target.value }))} className={`${classeInput} min-w-[200px] flex-1`} />
                  <input value={edicao.responsavel} onChange={(e) => setEdicao((v) => ({ ...v, responsavel: e.target.value }))} className={`${classeInput} w-40`} />
                  <input type="date" value={edicao.data} onChange={(e) => setEdicao((v) => ({ ...v, data: e.target.value }))} className={classeInput} />
                  <select value={edicao.recorrencia} onChange={(e) => setEdicao((v) => ({ ...v, recorrencia: e.target.value as Recorrencia }))} className={classeInput}>
                    {RECORRENCIAS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => {
                      const mudou = Object.fromEntries(Object.entries(edicao).filter(([k, v]) => v !== o[k as keyof typeof edicao]))
                      if (!Object.keys(mudou).length) return setPainel(null)
                      return executar(() => editar.mutateAsync({ id: o.id, ...mudou }))
                    }}
                    className="rounded-md bg-marca px-3 py-1.5 text-[12px] font-semibold text-marca-tinta disabled:opacity-40"
                  >
                    Salvar
                  </button>
                </>
              )}
              <button type="button" onClick={() => setPainel(null)} className="text-[12px] text-tinta-fraca hover:text-tinta">
                Fechar
              </button>
            </div>
            {erro && <p className="mt-1 text-right text-[11px] text-status-vencido">{erro}</p>}
          </td>
        </tr>
      )}
      {aviso && !painel && (
        <tr>
          <td colSpan={colunas} className="px-4 pb-2 text-right text-[11px] text-status-vigente">
            {aviso}
          </td>
        </tr>
      )}
    </>
  )
}
