'use client'

import { useQuery } from '@tanstack/react-query'
import type { ContratosProtheus } from '@/lib/shared/contratosProtheus'
import { chamarApi } from './cliente'

/** Contratos do Protheus no navegador (TanStack Query). O cache muda 1x por dia. */
export function useContratosProtheus() {
  return useQuery({
    queryKey: ['contratos-protheus'],
    queryFn: () => chamarApi<ContratosProtheus>('GET', '/contratos-protheus'),
  })
}
