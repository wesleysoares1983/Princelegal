'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColunaTarefa, QuadroTarefas, Tarefa } from '@/lib/shared/tarefas'
import { chamarApi } from './cliente'

/** Tarefas no navegador (TanStack Query). */

const CHAVE_QUADRO = ['tarefas', 'quadro'] as const

export function useTarefas() {
  return useQuery({
    queryKey: CHAVE_QUADRO,
    queryFn: () => chamarApi<QuadroTarefas>('GET', '/tarefas'),
  })
}

function useMutacao<V, R>(fn: (v: V) => Promise<R>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => Promise.all([cliente.invalidateQueries({ queryKey: ['tarefas'] }), cliente.invalidateQueries({ queryKey: ['auditoria'] })]),
  })
}

export interface DadosTarefaTela {
  titulo: string
  descricao: string
  responsavel: string
  prazo: string
  contratoId: string
  coluna: ColunaTarefa
}

export const useCriarTarefa = () => useMutacao((v: DadosTarefaTela) => chamarApi<Tarefa>('POST', '/tarefas', v))

export const useRemoverTarefa = () =>
  useMutacao(({ id, justificativa }: { id: string; justificativa: string }) => chamarApi<null>('DELETE', `/tarefas/${id}`, { justificativa }))

/**
 * Mover é otimista: o cartão muda de coluna na hora e volta se a API recusar
 * -- sem isso, cada soltar esperaria a resposta para o cartão sair do lugar.
 */
export function useMoverTarefa() {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: ({ id, coluna }: { id: string; coluna: ColunaTarefa }) => chamarApi<Tarefa>('POST', `/tarefas/${id}/mover`, { coluna }),
    onMutate: async ({ id, coluna }) => {
      await cliente.cancelQueries({ queryKey: CHAVE_QUADRO })
      const anterior = cliente.getQueryData<QuadroTarefas>(CHAVE_QUADRO)
      if (anterior) {
        cliente.setQueryData<QuadroTarefas>(CHAVE_QUADRO, {
          ...anterior,
          itens: anterior.itens.map((t) => (t.id === id ? { ...t, coluna } : t)),
        })
      }
      return { anterior }
    },
    onError: (_erro, _v, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(CHAVE_QUADRO, contexto.anterior)
    },
    onSettled: () => Promise.all([cliente.invalidateQueries({ queryKey: ['tarefas'] }), cliente.invalidateQueries({ queryKey: ['auditoria'] })]),
  })
}
