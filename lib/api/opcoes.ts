'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CampoOpcao, Opcao, OpcoesPorCampo } from '@/lib/shared/opcoes'
import { chamarApi } from './cliente'

/**
 * Opcoes de cadastro no navegador (TanStack Query).
 *
 * Toda mutacao invalida as listas: a tela de Configuracoes e o formulario de
 * Novo Contrato, abertos ao mesmo tempo, enxergam a mudanca sem recarregar --
 * o que antes dependia do evento `cj:config` e do localStorage.
 */

const CHAVE = ['opcoes-cadastro'] as const

/** Ativas -- o que os formularios oferecem. */
export function useOpcoes() {
  return useQuery({
    queryKey: [...CHAVE, 'ativas'],
    queryFn: () => chamarApi<OpcoesPorCampo>('GET', '/opcoes-cadastro'),
  })
}

/** Com as inativas -- so a tela de administracao (a API ignora o pedido para nao-admin). */
export function useOpcoesAdmin() {
  return useQuery({
    queryKey: [...CHAVE, 'todas'],
    queryFn: () => chamarApi<OpcoesPorCampo>('GET', '/opcoes-cadastro?incluirInativas=true'),
  })
}

function useMutacaoOpcao<V>(fn: (v: V) => Promise<Opcao>) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => cliente.invalidateQueries({ queryKey: CHAVE }),
  })
}

export const useCriarOpcao = () =>
  useMutacaoOpcao((v: { campo: CampoOpcao; valor: string }) => chamarApi<Opcao>('POST', '/opcoes-cadastro', v))

export const useRenomearOpcao = () =>
  useMutacaoOpcao((v: { id: string; versao: number; valor: string }) =>
    chamarApi<Opcao>('PATCH', `/opcoes-cadastro/${v.id}`, { versao: v.versao, valor: v.valor }),
  )

export const useDesativarOpcao = () =>
  useMutacaoOpcao((id: string) => chamarApi<Opcao>('POST', `/opcoes-cadastro/${id}/desativar`))

export const useReativarOpcao = () =>
  useMutacaoOpcao((id: string) => chamarApi<Opcao>('POST', `/opcoes-cadastro/${id}/reativar`))
