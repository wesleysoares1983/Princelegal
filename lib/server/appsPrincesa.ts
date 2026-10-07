import { unstable_rethrow } from 'next/navigation'
import { configAppsPrincesa } from './config'

/**
 * Cliente da API interna dos Apps Princesa (cadastro central de usuarios).
 *
 * Contrato em docs/INTEGRACAO_USUARIOS.md. Sempre backend a backend: a
 * `X-Internal-Key` nunca pode chegar ao navegador, por isso este modulo so
 * e importado por Route Handlers.
 */

export interface UsuarioCentral {
  matricula: string
  nome: string
  email: string
  perfil: string | null
  cargo: string | null
}

export type ResultadoLogin =
  | { tipo: 'ok'; usuario: UsuarioCentral }
  | { tipo: 'senha_temporaria'; token: string }
  | { tipo: 'credenciais_invalidas' | 'usuario_inativo' | 'sem_acesso_app' | 'indisponivel' }

export type ResultadoValidacaoToken = { tipo: 'ok'; usuario: UsuarioCentral } | { tipo: 'token_invalido' | 'indisponivel' }

const TEMPO_LIMITE_MS = 10_000

interface RespostaCentral {
  status: number
  corpo: Record<string, unknown>
}

/**
 * `dados` presente = POST com JSON; ausente = GET (so a listagem de usuarios).
 * `null` = nao deu para falar com a API (rede, timeout, resposta que nao e JSON).
 */
async function chamar(caminho: string, dados?: Record<string, unknown>): Promise<RespostaCentral | null> {
  const { url, chaveInterna } = configAppsPrincesa()
  try {
    const resposta = await fetch(`${url}/${caminho}`, {
      method: dados ? 'POST' : 'GET',
      headers: dados ? { 'Content-Type': 'application/json', 'X-Internal-Key': chaveInterna } : { 'X-Internal-Key': chaveInterna },
      body: dados ? JSON.stringify(dados) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    const corpo = await resposta.json().catch(() => null)
    if (!corpo || typeof corpo !== 'object') {
      console.error(`[apps-princesa] ${caminho}: resposta sem JSON (HTTP ${resposta.status})`)
      return null
    }
    return { status: resposta.status, corpo }
  } catch (erro) {
    // Erros de controle do Next (pre-renderizacao, redirect) nao sao falha de rede.
    unstable_rethrow(erro)
    console.error(`[apps-princesa] ${caminho}: falha de comunicação`, erro instanceof Error ? erro.message : erro)
    return null
  }
}

function lerUsuario(valor: unknown): UsuarioCentral | null {
  if (!valor || typeof valor !== 'object') return null
  const u = valor as Record<string, unknown>
  if (typeof u.matricula !== 'string' || typeof u.nome !== 'string' || typeof u.email !== 'string') return null
  return {
    matricula: u.matricula,
    nome: u.nome,
    email: u.email,
    perfil: typeof u.perfil === 'string' ? u.perfil : null,
    cargo: typeof u.cargo === 'string' ? u.cargo : null,
  }
}

/** `usuario` aceita matricula ou e-mail -- quem decide qual e a API central (tem "@" = e-mail). */
export async function autenticar(usuario: string, senha: string): Promise<ResultadoLogin> {
  const resposta = await chamar('api/interno/usuarios/login', { usuario, senha, app_id: configAppsPrincesa().appId })
  if (!resposta) return { tipo: 'indisponivel' }
  const { status, corpo } = resposta

  if (corpo.sucesso === true) {
    const u = lerUsuario(corpo.usuario)
    if (u) return { tipo: 'ok', usuario: u }
    console.error('[apps-princesa] login: resposta de sucesso sem os dados do usuário')
    return { tipo: 'indisponivel' }
  }

  switch (corpo.erro) {
    case 'credenciais_invalidas':
    case 'usuario_inativo':
    case 'sem_acesso_app':
      return { tipo: corpo.erro }
    case 'senha_temporaria':
      if (typeof corpo.token === 'string' && corpo.token) return { tipo: 'senha_temporaria', token: corpo.token }
      break
  }

  // 401 "Não autorizado." = chave interna errada; 400 = APP_ID invalido. Os
  // dois sao erro de configuracao deste app, nao do usuario.
  console.error(`[apps-princesa] login: resposta inesperada (HTTP ${status}): ${String(corpo.erro)}`)
  return { tipo: 'indisponivel' }
}

export async function validarTokenRedefinicao(token: string): Promise<ResultadoValidacaoToken> {
  const resposta = await chamar('api/interno/usuarios/validar-token-redefinicao', { token })
  if (!resposta) return { tipo: 'indisponivel' }
  const { status, corpo } = resposta

  if (corpo.sucesso === true) {
    const u = lerUsuario(corpo.usuario)
    if (u) return { tipo: 'ok', usuario: u }
  }
  if (corpo.erro === 'token_invalido') return { tipo: 'token_invalido' }

  console.error(`[apps-princesa] validar-token-redefinicao: resposta inesperada (HTTP ${status}): ${String(corpo.erro)}`)
  return { tipo: 'indisponivel' }
}

export interface UsuarioDoApp extends UsuarioCentral {
  ativo: boolean
  /** ISO, sem fuso (como vem dos Apps Princesa). */
  criadoEm: string | null
}

export interface ListagemDoApp {
  app: { id: number; nome: string; ativo: boolean }
  cargos: { nome: string; totalUsuarios: number }[]
  /** Todos com acesso via perfil -- inclusive inativos (`ativo: false`). */
  usuarios: UsuarioDoApp[]
}

/**
 * Quem tem acesso a ESTE app (APP_ID) e os cargos cadastrados nele.
 *
 * Vem completa, sem paginacao. App inativo no catalogo volta com `usuarios`
 * vazio -- a mesma regra do login: app inativo nao libera ninguem.
 * `null` = indisponivel (rede, chave errada, app inexistente: tudo logado).
 */
export async function listarUsuariosDoApp(): Promise<ListagemDoApp | null> {
  const caminho = `api/interno/apps/${configAppsPrincesa().appId}/usuarios`
  const resposta = await chamar(caminho)
  if (!resposta) return null
  const { status, corpo } = resposta

  const app = corpo.app as Record<string, unknown> | undefined
  if (corpo.sucesso !== true || !app || !Array.isArray(corpo.usuarios) || !Array.isArray(corpo.cargos)) {
    console.error(`[apps-princesa] listar usuários: resposta inesperada (HTTP ${status}): ${String(corpo.erro)}`)
    return null
  }

  const usuarios: UsuarioDoApp[] = []
  for (const bruto of corpo.usuarios) {
    const u = lerUsuario(bruto)
    if (!u) continue
    const extra = bruto as Record<string, unknown>
    usuarios.push({ ...u, ativo: extra.ativo === true, criadoEm: typeof extra.criado_em === 'string' ? extra.criado_em : null })
  }

  return {
    app: { id: Number(app.id), nome: String(app.nome ?? ''), ativo: app.ativo === true },
    cargos: (corpo.cargos as Record<string, unknown>[])
      .filter((c) => typeof c?.nome === 'string')
      .map((c) => ({ nome: c.nome as string, totalUsuarios: Number(c.total_usuarios) || 0 })),
    usuarios,
  }
}

/** Pagina publica de "esqueci minha senha" -- tambem usada para trocar a senha por vontade propria. */
export function urlEsqueciSenha(): string {
  return `${configAppsPrincesa().url}/esqueci-senha`
}

/** Troca obrigatoria de senha temporaria; os Apps Princesa voltam para `retorno` com `?token_confirmacao=`. */
export function urlRedefinirSenha(token: string, retorno: string): string {
  return `${configAppsPrincesa().url}/redefinir-senha/${encodeURIComponent(token)}?retorno=${encodeURIComponent(retorno)}`
}
