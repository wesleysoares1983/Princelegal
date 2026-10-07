import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import type { UsuarioSessao } from '@/lib/usuario'
import { segredoSessao } from './config'
import { agoraEmSegundos, assinar, verificar } from './token'

/**
 * Sessao do app: um cookie httpOnly assinado com os dados do usuario.
 *
 * Os Apps Princesa so validam a senha -- quem mantem a sessao e este app.
 * Sem "Lembrar de mim" o cookie e de sessao do navegador e o token vale 8h;
 * com ele, 30 dias. Como o cadastro central nao avisa quando alguem e
 * desativado, essa duracao e o tempo maximo que um usuario desativado ainda
 * consegue usar o sistema.
 */

export const COOKIE_SESSAO = 'cj_sessao'
/** Guarda "lembrar" e o destino enquanto o usuario troca a senha temporaria nos Apps Princesa. */
export const COOKIE_TROCA_SENHA = 'cj_troca_senha'
export const CAMINHO_RETORNO_SENHA = '/api/auth/retorno-senha'

const DURACAO_PADRAO_S = 8 * 60 * 60
const DURACAO_LEMBRAR_S = 30 * 24 * 60 * 60
const DURACAO_TROCA_SENHA_S = 15 * 60

export interface TokenSessao {
  u: UsuarioSessao
  /** "Lembrar de mim": cookie persistente em vez de cookie de sessao do navegador. */
  l?: boolean
  exp: number
}

interface TokenTrocaSenha {
  lembrar: boolean
  destino: string
  exp: number
}

export function lerTokenSessao(token: string | undefined): TokenSessao | null {
  return verificar<TokenSessao>(token, segredoSessao())
}

export function lerSessao(token: string | undefined): UsuarioSessao | null {
  return lerTokenSessao(token)?.u ?? null
}

/** Usuario da requisicao atual, para Server Components e Route Handlers. */
export async function obterSessao(): Promise<UsuarioSessao | null> {
  return lerSessao((await cookies()).get(COOKIE_SESSAO)?.value)
}

export function gravarSessao(res: NextResponse, usuario: UsuarioSessao, lembrar: boolean, seguro: boolean) {
  const duracao = lembrar ? DURACAO_LEMBRAR_S : DURACAO_PADRAO_S
  const token: TokenSessao = { u: usuario, l: lembrar, exp: agoraEmSegundos() + duracao }
  definirCookieSessao(res, assinarSessao(token), token, seguro)
}

export function assinarSessao(token: TokenSessao): string {
  return assinar({ ...token }, segredoSessao())
}

/**
 * Escreve o cookie de sessao. Tambem usado para atualizar os dados do
 * usuario no meio da sessao (cargo mudou no cadastro central) sem estender o
 * prazo -- quem chama mantem o `exp` original.
 */
export function definirCookieSessao(res: NextResponse, valor: string, token: TokenSessao, seguro: boolean) {
  res.cookies.set(COOKIE_SESSAO, valor, {
    httpOnly: true,
    sameSite: 'lax',
    secure: seguro,
    path: '/',
    // Sem maxAge = cookie de sessao: some ao fechar o navegador.
    ...(token.l ? { maxAge: Math.max(0, token.exp - agoraEmSegundos()) } : {}),
  })
}

export function limparSessao(res: NextResponse) {
  res.cookies.set(COOKIE_SESSAO, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

export function gravarTrocaSenha(res: NextResponse, lembrar: boolean, destino: string, seguro: boolean) {
  const token = assinar({ lembrar, destino, exp: agoraEmSegundos() + DURACAO_TROCA_SENHA_S }, segredoSessao())
  res.cookies.set(COOKIE_TROCA_SENHA, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: seguro,
    path: CAMINHO_RETORNO_SENHA,
    maxAge: DURACAO_TROCA_SENHA_S,
  })
}

export function lerTrocaSenha(req: NextRequest): { lembrar: boolean; destino: string } | null {
  const dados = verificar<TokenTrocaSenha>(req.cookies.get(COOKIE_TROCA_SENHA)?.value, segredoSessao())
  return dados ? { lembrar: dados.lembrar === true, destino: destinoSeguro(dados.destino) } : null
}

export function limparTrocaSenha(res: NextResponse) {
  res.cookies.set(COOKIE_TROCA_SENHA, '', { httpOnly: true, sameSite: 'lax', path: CAMINHO_RETORNO_SENHA, maxAge: 0 })
}

/**
 * Para onde mandar o usuario depois de entrar: so caminhos internos.
 *
 * `//outro.site` e `/\outro.site` sao interpretados pelo navegador como
 * outro host -- aceitar isso faria do login um redirecionador aberto.
 */
export function destinoSeguro(valor: unknown): string {
  if (typeof valor !== 'string' || !valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) {
    return '/'
  }
  if (valor === '/login' || valor.startsWith('/login?') || valor.startsWith('/api/')) return '/'
  return valor
}

/**
 * Origem publica da requisicao (`https://host`), respeitando o proxy reverso.
 *
 * Atras do Caddy/nginx a requisicao chega como `http://app:3400`; os
 * cabecalhos X-Forwarded-* trazem o endereco que o navegador realmente usou.
 * E esse que vai como URL de retorno para os Apps Princesa, que conferem o
 * host contra o cadastrado no catalogo.
 */
export function origemPublica(req: NextRequest): string {
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.nextUrl.protocol.replace(/:$/, '')
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host') || req.nextUrl.host
  return `${proto}://${host}`
}

export const ehHttps = (req: NextRequest) => origemPublica(req).startsWith('https://')

/**
 * POST vindo de outro site? Navegadores mandam `Origin` em todo POST
 * cross-site; se ele existir e nao bater com o nosso host, recusa.
 */
export function origemConfere(req: NextRequest): boolean {
  const origem = req.headers.get('origin')
  if (!origem) return true
  try {
    return new URL(origem).host === new URL(origemPublica(req)).host
  } catch {
    return false
  }
}
