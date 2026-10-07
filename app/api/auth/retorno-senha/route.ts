import { NextResponse, type NextRequest } from 'next/server'
import { validarTokenRedefinicao } from '@/lib/server/appsPrincesa'
import { ehHttps, gravarSessao, lerTrocaSenha, limparTrocaSenha, origemPublica } from '@/lib/server/sessao'
import { nivelDoCargo } from '@/lib/usuario'

/**
 * GET /api/auth/retorno-senha?token_confirmacao=...
 *
 * Volta da troca obrigatoria de senha nos Apps Princesa. O token de
 * confirmacao (5 minutos) e trocado pelos dados do usuario, backend a
 * backend, e a sessao e aberta como num login comum. Qualquer falha manda
 * para o login com uma mensagem -- a senha nova ja esta valendo, entao
 * entrar com ela resolve.
 */
export async function GET(req: NextRequest) {
  const origem = origemPublica(req)
  const pendente = lerTrocaSenha(req)
  const token = req.nextUrl.searchParams.get('token_confirmacao')

  const resultado = token ? await validarTokenRedefinicao(token) : ({ tipo: 'token_invalido' } as const)

  if (resultado.tipo !== 'ok') {
    const codigo = resultado.tipo === 'indisponivel' ? 'indisponivel' : 'troca_senha'
    const res = NextResponse.redirect(new URL(`/login?erro=${codigo}`, origem))
    limparTrocaSenha(res)
    return res
  }

  const res = NextResponse.redirect(new URL(pendente?.destino ?? '/', origem))
  gravarSessao(
    res,
    { ...resultado.usuario, nivel: nivelDoCargo(resultado.usuario.cargo) },
    pendente?.lembrar ?? false,
    ehHttps(req),
  )
  limparTrocaSenha(res)
  return res
}
