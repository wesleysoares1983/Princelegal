'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Documento, TipoDocumento } from '@/lib/shared/documentos'
import { EXTENSOES_ACEITAS } from '@/lib/shared/documentos'
import { chamarApi } from './cliente'

/** Documentos do contrato no navegador (TanStack Query). */

export function useDocumentos(contratoId: string, incluirRemovidos: boolean) {
  return useQuery({
    queryKey: ['documentos', contratoId, incluirRemovidos],
    queryFn: () =>
      chamarApi<Documento[]>(
        'GET',
        `/contratos/${contratoId}/documentos?incluirVersoes=true${incluirRemovidos ? '&incluirRemovidos=true' : ''}`,
      ),
  })
}

/** Link direto (o cookie de sessao vai junto): baixar ou, para PDF, abrir no navegador. */
export function urlArquivo(documentoId: string, versao: number | 'atual' = 'atual', abrir = false) {
  return `/api/v1/documentos/${documentoId}/versoes/${versao}/arquivo${abrir ? '?inline=1' : ''}`
}

/**
 * Checagem rapida no navegador, so para dar retorno antes de enviar. Quem
 * decide de verdade e o servidor, pelo conteudo do arquivo.
 */
export function problemaNoArquivo(arquivo: File, maxMb = 25): string | null {
  const nome = arquivo.name.toLowerCase()
  if (!EXTENSOES_ACEITAS.some((e) => nome.endsWith(e))) return 'Formato não aceito. Envie um PDF ou um Word (.doc/.docx).'
  if (arquivo.size > maxMb * 1024 * 1024) return `Arquivo grande demais: o limite é ${maxMb} MB.`
  if (arquivo.size === 0) return 'O arquivo está vazio.'
  return null
}

function useMutacaoDocumento<V>(contratoId: string, fn: (v: V) => Promise<Documento>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    // Documento mexe na auditoria do contrato tambem.
    onSettled: () =>
      Promise.all([
        cliente.invalidateQueries({ queryKey: ['documentos', contratoId] }),
        cliente.invalidateQueries({ queryKey: ['auditoria'] }),
      ]),
  })
}

export const useEnviarDocumento = (contratoId: string) =>
  useMutacaoDocumento(contratoId, (v: { arquivo: File; tipo: TipoDocumento; nome?: string }) => {
    const form = new FormData()
    form.set('arquivo', v.arquivo)
    form.set('tipo', v.tipo)
    if (v.nome?.trim()) form.set('nome', v.nome.trim())
    return chamarApi<Documento>('POST', `/contratos/${contratoId}/documentos`, form)
  })

export const useNovaVersao = (contratoId: string) =>
  useMutacaoDocumento(contratoId, (v: { documentoId: string; arquivo: File }) => {
    const form = new FormData()
    form.set('arquivo', v.arquivo)
    return chamarApi<Documento>('POST', `/documentos/${v.documentoId}/versoes`, form)
  })

export const useRemoverDocumento = (contratoId: string) =>
  useMutacaoDocumento(contratoId, (v: { documentoId: string; motivo: string }) =>
    chamarApi<Documento>('DELETE', `/documentos/${v.documentoId}`, { motivo: v.motivo }),
  )

export const useRestaurarDocumento = (contratoId: string) =>
  useMutacaoDocumento(contratoId, (documentoId: string) => chamarApi<Documento>('POST', `/documentos/${documentoId}/restaurar`))
