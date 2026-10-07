import { NextResponse, type NextRequest } from 'next/server'
import {
  assinarSessao,
  COOKIE_SESSAO,
  definirCookieSessao,
  ehHttps,
  lerTokenSessao,
  limparSessao,
} from '@/lib/server/sessao'
import { revalidarSessao } from '@/lib/server/usuariosApp'

/**
 * Trava o sistema atras do login, no servidor.
 *
 * Sem sessao valida: paginas vao para /login (guardando para onde a pessoa
 * ia), e a API responde 401. Substitui o antigo AuthGuard, que so escondia
 * o conteudo no navegador depois de ele ja ter sido entregue.
 *
 * Com sessao, ela ainda e conferida contra o cadastro central (lista de quem
 * tem acesso ao app, em cache -- ver lib/server/usuariosApp): usuario
 * desativado ou sem acesso e deslogado; cargo/nome alterados entram na
 * sessao na hora, mantendo o prazo original dela.
 */

/** Rotas que precisam funcionar sem sessao. /api/health: healthcheck do Docker. */
const PUBLICAS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/retorno-senha',
  '/api/auth/esqueci-senha',
  '/api/auth/sair',
])

/**
 * 401 da API. /api/v1 usa o envelope padrao (`{ erro: { codigo, mensagem } }`,
 * igual ao das rotas); o resto de /api mantem o formato das rotas de login.
 */
function naoAutenticadoApi(pathname: string) {
  const mensagem = 'Sessão expirada. Entre novamente.'
  const corpo = pathname.startsWith('/api/v1/')
    ? { erro: { codigo: 'NAO_AUTENTICADO', mensagem } }
    : { ok: false, erro: 'nao_autenticado', mensagem }
  return NextResponse.json(corpo, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
}

function semSessao(req: NextRequest, motivo?: 'acesso_revogado') {
  const { pathname, search } = req.nextUrl
  const res = pathname.startsWith('/api/')
    ? naoAutenticadoApi(pathname)
    : (() => {
        const login = new URL('/login', req.url)
        if (motivo) login.searchParams.set('erro', motivo)
        else if (pathname !== '/') login.searchParams.set('destino', pathname + search)
        return NextResponse.redirect(login)
      })()
  if (motivo) limparSessao(res)
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLICAS.has(pathname)) return NextResponse.next()

  const token = lerTokenSessao(req.cookies.get(COOKIE_SESSAO)?.value)

  if (pathname === '/login') {
    return token ? NextResponse.redirect(new URL('/', req.url)) : NextResponse.next()
  }
  if (!token) return semSessao(req)

  const revalidacao = await revalidarSessao(token.u)
  if (revalidacao.tipo === 'revogado') return semSessao(req, 'acesso_revogado')

  if (revalidacao.tipo === 'ok') {
    // Configurações é só de administrador.
    if (pathname.startsWith('/configuracoes') && token.u.nivel !== 'admin') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  // Dados mudaram no cadastro central: cookie novo (mesmo prazo) na resposta
  // E na requisicao em curso, para o layout desta mesma pagina ja enxergar o
  // cargo novo.
  const novoToken = { ...token, u: revalidacao.usuario }
  const valor = assinarSessao(novoToken)
  let res: NextResponse
  if (pathname.startsWith('/configuracoes') && novoToken.u.nivel !== 'admin') {
    res = NextResponse.redirect(new URL('/', req.url))
  } else {
    req.cookies.set(COOKIE_SESSAO, valor)
    const headers = new Headers(req.headers)
    headers.set('cookie', req.cookies.toString())
    res = NextResponse.next({ request: { headers } })
  }
  definirCookieSessao(res, valor, novoToken, ehHttps(req))
  return res
}

export const config = {
  // Fora: arquivos do build e imagens de public/ (a arte do login precisa carregar sem sessao).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
