'use client'

import { createContext, useContext } from 'react'
import type { UsuarioSessao } from '@/lib/usuario'

/**
 * Usuario logado para os componentes de cliente.
 *
 * O layout raiz le o cookie de sessao no servidor e entrega o usuario aqui --
 * sem uma chamada extra de API e sem o "pisca" de tela vazia enquanto o
 * navegador descobre quem esta logado.
 */
const ContextoUsuario = createContext<UsuarioSessao | null>(null)

export function ProvedorUsuario({ usuario, children }: { usuario: UsuarioSessao | null; children: React.ReactNode }) {
  return <ContextoUsuario.Provider value={usuario}>{children}</ContextoUsuario.Provider>
}

/** `null` so na tela de login -- o proxy nao deixa chegar sem sessao nas demais. */
export function useUsuario() {
  return useContext(ContextoUsuario)
}

/** Apaga a sessao e recarrega no login (recarga completa, para o layout reler o cookie). */
export async function sair() {
  try {
    await fetch('/api/auth/sair', { method: 'POST' })
  } finally {
    window.location.assign('/login')
  }
}
