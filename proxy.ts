import { NextResponse, type NextRequest } from 'next/server'
import { gerarNonce, politicaCsp } from '@/lib/server/csp'
import {
  assinarSessao,
  COOKIE_SESSAO,
  definirCookieSessao,
  ehHttps,
  lerTokenSessao,
  limparSessao,
} from '@/lib/server/sessao'
import { revalidarSessao } from '@/lib/server/usuariosApp'
import { podeCadastrar, type UsuarioSessao } from '@/lib/usuario'

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
 *
 * Paginas tambem recebem aqui a Content-Security-Policy com nonce (lib/server/csp).
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

/**
 * Segue para a pagina/rota. Em paginas (fora de /api), o nonce vai no
 * cabecalho CSP da requisicao (o Next le dali para marcar os proprios
 * scripts) e da resposta (o navegador aplica).
 */
function seguir(req: NextRequest, headers?: Headers) {
  if (req.nextUrl.pathname.startsWith('/api/')) return headers ? NextResponse.next({ request: { headers } }) : NextResponse.next()
  const csp = politicaCsp(gerarNonce())
  const h = headers ?? new Headers(req.headers)
  h.set('content-security-policy', csp)
  const res = NextResponse.next({ request: { headers: h } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

/**
 * Pagina que o nivel nao pode abrir -> para onde mandar. Configuracoes e so
 * de administrador; cadastro de contrato nao abre para somente leitura. A
 * API barra o mesmo nos servicos; aqui so se evita a tela que nao funcionaria.
 */
function paginaBarrada(pathname: string, usuario: UsuarioSessao): string | null {
  if (pathname.startsWith('/configuracoes') && usuario.nivel !== 'admin') return '/'
  if (pathname.startsWith('/contratos/novo') && !podeCadastrar(usuario)) return '/contratos'
  return null
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLICAS.has(pathname)) return seguir(req)

  const token = lerTokenSessao(req.cookies.get(COOKIE_SESSAO)?.value)

  if (pathname === '/login') {
    return token ? NextResponse.redirect(new URL('/', req.url)) : seguir(req)
  }
  if (!token) return semSessao(req)

  const revalidacao = await revalidarSessao(token.u)
  if (revalidacao.tipo === 'revogado') return semSessao(req, 'acesso_revogado')

  if (revalidacao.tipo === 'ok') {
    const destino = paginaBarrada(pathname, token.u)
    return destino ? NextResponse.redirect(new URL(destino, req.url)) : seguir(req)
  }

  // Dados mudaram no cadastro central: cookie novo (mesmo prazo) na resposta
  // E na requisicao em curso, para o layout desta mesma pagina ja enxergar o
  // cargo novo.
  const novoToken = { ...token, u: revalidacao.usuario }
  const valor = assinarSessao(novoToken)
  let res: NextResponse
  const destino = paginaBarrada(pathname, novoToken.u)
  if (destino) {
    res = NextResponse.redirect(new URL(destino, req.url))
  } else {
    req.cookies.set(COOKIE_SESSAO, valor)
    const headers = new Headers(req.headers)
    headers.set('cookie', req.cookies.toString())
    res = seguir(req, headers)
  }
  definirCookieSessao(res, valor, novoToken, ehHttps(req))
  return res
}

export const config = {
  // Fora: arquivos do build e imagens de public/ (a arte do login precisa carregar sem sessao).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
