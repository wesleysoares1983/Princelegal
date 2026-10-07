import { redirect } from 'next/navigation'

/**
 * Configurações vive nos subitens do menu -- a rota-mãe só existe para quem
 * chega direto em "/configuracoes" (link antigo, digitado à mão) não cair
 * num 404.
 */
export default function Configuracoes() {
  redirect('/configuracoes/usuarios')
}
