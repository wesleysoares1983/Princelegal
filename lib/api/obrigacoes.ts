'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Paginado } from '@/lib/shared/contratos'
import type { Obrigacao, Recorrencia, SituacaoObrigacao } from '@/lib/shared/obrigacoes'
import { chamarApi } from './cliente'

/** Obrigações no navegador (TanStack Query). */

export interface FiltroObrigacoesTela {
  busca?: string
  responsavel?: string
  vigenciaDe?: string
  vigenciaAte?: string
  situacao?: SituacaoObrigacao | 'todas'
  atrasadas?: boolean
  pagina?: number
}

function comQuery(caminho: string, params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) q.set(k, String(v))
  const s = q.toString()
  return s ? `${caminho}?${s}` : caminho
}

export function useObrigacoes(f: FiltroObrigacoesTela) {
  return useQuery({
    queryKey: ['obrigacoes', 'lista', f],
    queryFn: () => chamarApi<Paginado<Obrigacao> & { facetas: { responsaveis: string[] } }>('GET', comQuery('/obrigacoes', { ...f, porPagina: 50 })),
    placeholderData: keepPreviousData,
  })
}

export function useObrigacoesDoContrato(contratoId: string) {
  return useQuery({
    queryKey: ['obrigacoes', 'contrato', contratoId],
    queryFn: () => chamarApi<Obrigacao[]>('GET', `/contratos/${contratoId}/obrigacoes`),
  })
}

function useMutacao<V, R>(fn: (v: V) => Promise<R>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([cliente.invalidateQueries({ queryKey: ['obrigacoes'] }), cliente.invalidateQueries({ queryKey: ['auditoria'] })]),
  })
}

export interface DadosObrigacaoTela {
  descricao: string
  responsavel: string
  data: string
  recorrencia: Recorrencia
}

export const useCriarObrigacao = (contratoId: string) =>
  useMutacao((v: DadosObrigacaoTela) => chamarApi<{ obrigacao: Obrigacao; avisos: string[] }>('POST', `/contratos/${contratoId}/obrigacoes`, v))

export const useEditarObrigacao = () =>
  useMutacao(({ id, ...dados }: Partial<DadosObrigacaoTela> & { id: string }) => chamarApi<Obrigacao>('PATCH', `/obrigacoes/${id}`, dados))

export const useCumprirObrigacao = () =>
  useMutacao(({ id, ...dados }: { id: string; cumpridaEm?: string; observacao?: string }) =>
    chamarApi<{ obrigacao: Obrigacao; proxima: Obrigacao | null }>('POST', `/obrigacoes/${id}/cumprir`, dados),
  )

export const useDesfazerCumprimento = () => useMutacao((id: string) => chamarApi<Obrigacao>('POST', `/obrigacoes/${id}/desfazer`))

export const useCancelarObrigacao = () =>
  useMutacao(({ id, motivo }: { id: string; motivo: string }) => chamarApi<Obrigacao>('POST', `/obrigacoes/${id}/cancelar`, { motivo }))
