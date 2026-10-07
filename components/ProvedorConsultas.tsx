'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'

/**
 * Cache das chamadas a /api/v1 (TanStack Query), um por aba.
 *
 * Erros 4xx sao respostas definitivas (permissao, validacao, nao existe):
 * nao adianta repetir. So falha de rede e 5xx ganham nova tentativa.
 */
export function ProvedorConsultas({ children }: { children: React.ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (tentativas, erro) =>
              tentativas < 2 && !(erro instanceof ErroDaApi && erro.status >= 400 && erro.status < 500),
          },
        },
      }),
  )
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
}
