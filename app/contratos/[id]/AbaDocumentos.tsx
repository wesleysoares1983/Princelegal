'use client'

import { useState } from 'react'
import { EstadoConsulta } from '@/components/EstadoConsulta'
import { useUsuario } from '@/components/ProvedorUsuario'
import { ErroDaApi } from '@/lib/api/cliente'
import {
  problemaNoArquivo,
  urlArquivo,
  useDocumentos,
  useEnviarDocumento,
  useNovaVersao,
  useRemoverDocumento,
  useRestaurarDocumento,
} from '@/lib/api/documentos'
import type { ContratoDetalhe } from '@/lib/shared/contratos'
import { EXTENSOES_ACEITAS, TIPOS_DOCUMENTO, formatarTamanho, type Documento, type TipoDocumento } from '@/lib/shared/documentos'
import { formatarDataHora } from '@/lib/shared/status'

/**
 * Aba Documentos: contrato assinado, aditivos, anexos, pareceres.
 *
 * Nada é apagado: "Remover" tira da lista (com motivo, na auditoria) e o
 * administrador pode ver os removidos e restaurá-los. Cada envio sobre um
 * documento existente vira uma nova versão; as anteriores continuam baixáveis.
 */

const mensagem = (e: unknown) =>
  e instanceof ErroDaApi ? (Object.values(e.campos)[0] ?? e.message) : 'Erro inesperado. Tente novamente.'

const ACEITA = EXTENSOES_ACEITAS.join(',')
const classeInput =
  'rounded-md border border-borda bg-painel-2 px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

function EnvioDocumento({ contratoId, aoErro }: { contratoId: string; aoErro: (m: string) => void }) {
  const [tipo, setTipo] = useState<TipoDocumento>('Anexo')
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const enviar = useEnviarDocumento(contratoId)

  async function confirmar() {
    if (!arquivo) return
    aoErro('')
    try {
      await enviar.mutateAsync({ arquivo, tipo, nome })
      setArquivo(null)
      setNome('')
    } catch (e) {
      aoErro(mensagem(e))
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-borda p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Tipo</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)} className={classeInput}>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Nome (opcional)</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder="Usa o nome do arquivo se vazio" className={classeInput} />
      </label>
      <label className="flex cursor-pointer flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-tinta-fraca">Arquivo (PDF ou Word)</span>
        <span className={`${classeInput} max-w-[240px] truncate`}>{arquivo ? `${arquivo.name} · ${formatarTamanho(arquivo.size)}` : 'Escolher arquivo…'}</span>
        <input
          type="file"
          accept={ACEITA}
          className="hidden"
          onChange={(e) => {
            const a = e.target.files?.[0] ?? null
            e.target.value = ''
            const problema = a && problemaNoArquivo(a)
            if (problema) return aoErro(problema)
            aoErro('')
            setArquivo(a)
          }}
        />
      </label>
      <button
        type="button"
        onClick={confirmar}
        disabled={!arquivo || enviar.isPending}
        className="rounded-md bg-marca px-3 py-1.5 text-[12px] font-semibold text-marca-tinta hover:opacity-90 disabled:opacity-40"
      >
        {enviar.isPending ? 'Enviando…' : 'Enviar'}
      </button>
    </div>
  )
}

function LinhaDocumento({
  doc,
  podeEditar,
  admin,
  contratoId,
  aoErro,
}: {
  doc: Documento
  podeEditar: boolean
  admin: boolean
  contratoId: string
  aoErro: (m: string) => void
}) {
  const [verVersoes, setVerVersoes] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const novaVersao = useNovaVersao(contratoId)
  const remover = useRemoverDocumento(contratoId)
  const restaurar = useRestaurarDocumento(contratoId)
  const ocupado = novaVersao.isPending || remover.isPending || restaurar.isPending
  const ehPdf = doc.atual.mime === 'application/pdf'

  async function executar(acao: () => Promise<unknown>) {
    aoErro('')
    try {
      await acao()
      return true
    } catch (e) {
      aoErro(mensagem(e))
      return false
    }
  }

  return (
    <>
      <tr className={`border-t border-borda align-top ${doc.removido ? 'opacity-60' : ''}`}>
        <td className="px-4 py-2">
          <p className={`font-medium text-tinta ${doc.removido ? 'line-through' : ''}`}>{doc.nome}</p>
          {doc.nome !== doc.atual.nomeArquivo && <p className="text-[11px] text-tinta-fraca">{doc.atual.nomeArquivo}</p>}
          {doc.removido && (
            <p className="text-[11px] text-status-vencido">
              Removido{doc.removido.por ? ` por ${doc.removido.por.nome}` : ''} em {formatarDataHora(doc.removido.em)} — {doc.removido.motivo}
            </p>
          )}
        </td>
        <td className="px-4 py-2 text-tinta-fraca">{doc.tipo}</td>
        <td className="px-4 py-2 text-tinta-fraca">
          {doc.versoes && doc.versoes.length > 1 ? (
            <button type="button" onClick={() => setVerVersoes((v) => !v)} className="hover:text-tinta" aria-expanded={verVersoes}>
              v{doc.versaoAtual} {verVersoes ? '▾' : '▸'}
            </button>
          ) : (
            `v${doc.versaoAtual}`
          )}
        </td>
        <td className="px-4 py-2 text-tinta-fraca">
          {formatarDataHora(doc.atual.enviadoEm)}
          <br />
          <span className="text-[11px]">{doc.atual.enviadoPor.nome}</span>
        </td>
        <td className="whitespace-nowrap px-4 py-2 text-tinta-fraca">{formatarTamanho(doc.atual.tamanhoBytes)}</td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] font-semibold">
            {ehPdf && (
              <a href={urlArquivo(doc.id, 'atual', true)} target="_blank" rel="noopener" className="text-marca hover:underline">
                Abrir
              </a>
            )}
            <a href={urlArquivo(doc.id)} className="text-marca hover:underline">
              Baixar
            </a>
            {podeEditar && !doc.removido && (
              <label className={`cursor-pointer text-tinta-fraca hover:text-tinta ${ocupado ? 'pointer-events-none opacity-40' : ''}`}>
                {novaVersao.isPending ? 'Enviando…' : 'Nova versão'}
                <input
                  type="file"
                  accept={ACEITA}
                  className="hidden"
                  onChange={(e) => {
                    const a = e.target.files?.[0]
                    e.target.value = ''
                    if (!a) return
                    const problema = problemaNoArquivo(a)
                    if (problema) return aoErro(problema)
                    void executar(() => novaVersao.mutateAsync({ documentoId: doc.id, arquivo: a }))
                  }}
                />
              </label>
            )}
            {podeEditar && !doc.removido && !removendo && (
              <button type="button" onClick={() => setRemovendo(true)} className="text-status-vencido hover:underline">
                Remover
              </button>
            )}
            {admin && doc.removido && (
              <button type="button" disabled={ocupado} onClick={() => executar(() => restaurar.mutateAsync(doc.id))} className="text-marca hover:underline disabled:opacity-40">
                Restaurar
              </button>
            )}
          </div>
          {removendo && (
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <input
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo da remoção"
                className={`${classeInput} w-56`}
              />
              <button
                type="button"
                disabled={motivo.trim().length < 3 || ocupado}
                onClick={async () => {
                  if (await executar(() => remover.mutateAsync({ documentoId: doc.id, motivo }))) {
                    setRemovendo(false)
                    setMotivo('')
                  }
                }}
                className="rounded-md bg-status-vencido px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                Remover
              </button>
              <button type="button" onClick={() => setRemovendo(false)} className="text-[11px] text-tinta-fraca hover:text-tinta">
                Cancelar
              </button>
            </div>
          )}
        </td>
      </tr>
      {verVersoes &&
        doc.versoes
          ?.filter((v) => v.versao !== doc.versaoAtual)
          .map((v) => (
            <tr key={v.versao} className="bg-painel-2/40 text-[11px] text-tinta-fraca">
              <td className="px-4 py-1.5 pl-8">{v.nomeArquivo}</td>
              <td />
              <td className="px-4 py-1.5">v{v.versao}</td>
              <td className="px-4 py-1.5">
                {formatarDataHora(v.enviadoEm)} · {v.enviadoPor.nome}
              </td>
              <td className="px-4 py-1.5">{formatarTamanho(v.tamanhoBytes)}</td>
              <td className="px-4 py-1.5 text-right">
                <a href={urlArquivo(doc.id, v.versao)} className="font-semibold text-marca hover:underline">
                  Baixar
                </a>
              </td>
            </tr>
          ))}
    </>
  )
}

export function AbaDocumentos({ contrato }: { contrato: ContratoDetalhe }) {
  const admin = useUsuario()?.nivel === 'admin'
  const [verRemovidos, setVerRemovidos] = useState(false)
  const [erro, setErro] = useState('')
  const { data, isPending, error, refetch } = useDocumentos(contrato.id, admin && verRemovidos)
  const podeEditar = contrato.permissoes.editar

  return (
    <div className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
      {podeEditar && <EnvioDocumento contratoId={contrato.id} aoErro={setErro} />}
      {!podeEditar && contrato.encerramento && (
        <p className="border-b border-borda px-4 py-2 text-[12px] text-tinta-fraca">Contrato encerrado: documentos somente para consulta.</p>
      )}
      {(erro || admin) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2">
          <p role="alert" className="text-[12px] text-status-vencido">
            {erro}
          </p>
          {admin && (
            <label className="flex items-center gap-1.5 text-[11px] text-tinta-fraca">
              <input type="checkbox" checked={verRemovidos} onChange={(e) => setVerRemovidos(e.target.checked)} />
              Mostrar removidos
            </label>
          )}
        </div>
      )}

      <EstadoConsulta carregando={isPending} erro={error} tentarDeNovo={refetch} />
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Versão</th>
                <th className="px-4 py-2 font-medium">Enviado</th>
                <th className="px-4 py-2 font-medium">Tamanho</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <LinhaDocumento key={d.id} doc={d} podeEditar={podeEditar} admin={admin} contratoId={contrato.id} aoErro={setErro} />
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-tinta-fraca">
                    Nenhum documento anexado.
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
