import { NextResponse } from 'next/server'
import { urlEsqueciSenha } from '@/lib/server/appsPrincesa'

/**
 * GET /api/auth/esqueci-senha -> redireciona para a pagina publica dos Apps Princesa.
 *
 * Serve tanto o "Esqueceu sua senha?" do login quanto o "Alterar senha" da
 * barra do topo. Passar por aqui, em vez de embutir a URL no navegador,
 * mantem a configuracao so no servidor.
 */
export function GET() {
  return NextResponse.redirect(urlEsqueciSenha())
}
