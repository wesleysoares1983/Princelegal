'use client'

import { redirect } from 'next/navigation'

/**
 * Configurações agora vive em dois subitens do menu (Cadastro de Usuários e
 * Opções de cadastro) -- a rota-mãe só existe para quem chega direto em
 * "/configuracoes" (link antigo, digitado à mão) não cair num 404.
 */
export default function Configuracoes() {
  redirect('/configuracoes/usuarios')
}
