'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ContratoDetalhe,
  ContratoResumo,
  EventoAuditoria,
  FiltroStatus,
  Paginado,
  Painel,
} from '@/lib/shared/contratos'
import { chamarApi } from './cliente'

/**
 * Contratos, painel, alertas e auditoria no navegador (TanStack Query).
 *
 * Qualquer mudanca num contrato invalida tudo que deriva dele (listas,
 * painel, alertas, auditoria e a contagem de uso das opcoes) -- e barato e
 * evita numero velho na tela de Inicio depois de encerrar um contrato.
 */

const RAIZES_AFETADAS = [['contratos'], ['painel'], ['alertas'], ['auditoria'], ['opcoes-cadastro']] as const

function comQuery(caminho: string, params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) q.set(k, String(v))
  const s = q.toString()
  return s ? `${caminho}?${s}` : caminho
}

export interface FiltroLista {
  status?: FiltroStatus
  renovacaoAutomatica?: 'sim'
  busca?: string
  ordenar?: 'vencimento' | 'nome' | 'codigo' | 'valor' | '-valor'
  pagina?: number
  porPagina?: number
}

export function useContratos(f: FiltroLista) {
  return useQuery({
    queryKey: ['contratos', 'lista', f],
    queryFn: () => chamarApi<Paginado<ContratoResumo>>('GET', comQuery('/contratos', { ...f })),
    // Ao trocar de filtro/pagina, a tabela antiga fica ate a nova chegar (sem piscar vazio).
    placeholderData: keepPreviousData,
  })
}

export function useContrato(id: string) {
  return useQuery({
    queryKey: ['contratos', 'detalhe', id],
    queryFn: () => chamarApi<ContratoDetalhe>('GET', `/contratos/${id}`),
  })
}

export function useAuditoriaDoContrato(id: string, pagina: number, ativo: boolean) {
  return useQuery({
    queryKey: ['auditoria', 'contrato', id, pagina],
    queryFn: () => chamarApi<Paginado<EventoAuditoria>>('GET', comQuery(`/contratos/${id}/auditoria`, { pagina, porPagina: 50 })),
    enabled: ativo,
  })
}

export function usePainel() {
  return useQuery({ queryKey: ['painel'], queryFn: () => chamarApi<Painel>('GET', '/painel') })
}

export function useAlertas() {
  return useQuery({
    queryKey: ['alertas'],
    queryFn: () => chamarApi<{ itens: (ContratoResumo & { ultimoAlertaEnviado: unknown })[] }>('GET', '/alertas'),
  })
}

export interface FiltroAuditoriaTela {
  busca?: string
  usuario?: string
  pagina?: number
}

export function useAuditoria(f: FiltroAuditoriaTela) {
  return useQuery({
    queryKey: ['auditoria', 'geral', f],
    queryFn: () =>
      chamarApi<Paginado<EventoAuditoria> & { facetas: { usuarios: { matricula: string; nome: string }[] } }>(
        'GET',
        comQuery('/auditoria', { ...f, porPagina: 50 }),
      ),
    placeholderData: keepPreviousData,
  })
}

function useMutacaoContrato<V>(fn: (v: V) => Promise<ContratoDetalhe>, outrasChaves: string[][] = []) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (contrato) => {
      // A resposta ja e o detalhe atualizado: entra direto no cache.
      cliente.setQueryData(['contratos', 'detalhe', contrato.id], contrato)
    },
    onSettled: () =>
      Promise.all([...RAIZES_AFETADAS, ...outrasChaves].map((queryKey) => cliente.invalidateQueries({ queryKey: [...queryKey] }))),
  })
}

/** Com arquivo, vai multipart (`dados` + `arquivo`): contrato e contrato assinado nascem juntos. */
export const useCriarContrato = () =>
  useMutacaoContrato(({ dados, arquivo }: { dados: Record<string, unknown>; arquivo?: File | null }) => {
    if (!arquivo) return chamarApi<ContratoDetalhe>('POST', '/contratos', dados)
    const form = new FormData()
    form.set('dados', JSON.stringify(dados))
    form.set('arquivo', arquivo)
    return chamarApi<ContratoDetalhe>('POST', '/contratos', form)
  })

export const useEditarContrato = (id: string) =>
  useMutacaoContrato((dados: Record<string, unknown>) => chamarApi<ContratoDetalhe>('PATCH', `/contratos/${id}`, dados))

export const useEncerrarContrato = (id: string) =>
  useMutacaoContrato((dados: { versao: number; justificativa: string; data?: string }) =>
    chamarApi<ContratoDetalhe>('POST', `/contratos/${id}/encerrar`, dados),
  )

export const useReabrirContrato = (id: string) =>
  useMutacaoContrato((dados: { versao: number; justificativa: string }) =>
    chamarApi<ContratoDetalhe>('POST', `/contratos/${id}/reabrir`, dados),
  )

/** JSON, ou multipart (`dados` + `arquivo`) quando vem o documento assinado. */
function corpoComArquivo(dados: Record<string, unknown>, arquivo?: File | null): Record<string, unknown> | FormData {
  if (!arquivo) return dados
  const form = new FormData()
  form.set('dados', JSON.stringify(dados))
  form.set('arquivo', arquivo)
  return form
}

export const useRegistrarAditivo = (id: string) =>
  useMutacaoContrato(
    ({ dados, arquivo }: { dados: Record<string, unknown>; arquivo?: File | null }) =>
      chamarApi<ContratoDetalhe>('POST', `/contratos/${id}/aditivos`, corpoComArquivo(dados, arquivo)),
    [['documentos', id]], // o aditivo assinado tambem entra na aba Documentos
  )

export const useAnularAditivo = (id: string) =>
  useMutacaoContrato((v: { aditivoId: string; versao: number; justificativa: string }) =>
    chamarApi<ContratoDetalhe>('POST', `/contratos/${id}/aditivos/${v.aditivoId}/anular`, { versao: v.versao, justificativa: v.justificativa }),
  )

/** Devolve o contrato NOVO; o antigo (encerrado como renovado) sai do cache pela invalidacao de ['contratos']. */
export const useRenovarContrato = (id: string) =>
  useMutacaoContrato(({ dados, arquivo }: { dados: Record<string, unknown>; arquivo?: File | null }) =>
    chamarApi<ContratoDetalhe>('POST', `/contratos/${id}/renovar`, corpoComArquivo(dados, arquivo)),
  )
