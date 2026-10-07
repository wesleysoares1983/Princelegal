import 'server-only'
import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { unstable_rethrow } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import type { UsuarioSessao } from '@/lib/usuario'
import type { ContextoAuditoria } from '../auditoria'
import { log } from '../log'
import { obterSessao } from '../sessao'
import { ErroApi, erroNaoAutenticado, erroValidacao, type CorpoErro } from './erros'

/**
 * Invólucro de toda rota de /api/v1.
 *
 * - resolve o usuario da sessao (401 se nao houver -- o proxy ja barra antes,
 *   isto e a segunda linha de defesa) e a origem para a auditoria;
 * - traduz erros de dominio (ErroApi) e de validacao (zod) para o envelope
 *   padrao; qualquer outro erro vira 500 com um id para achar no log;
 * - marca toda resposta como `private, no-store`: dado de contrato nunca
 *   deve ficar em cache de navegador ou proxy.
 *
 * O handler devolve os dados (viram JSON 200) ou um Response pronto
 * (`respostaCriada`, arquivos, exportacoes).
 */

export interface ContextoRota {
  usuario: UsuarioSessao
  auditoria: ContextoAuditoria
}

const SEM_CACHE = { 'Cache-Control': 'private, no-store' }

export function respostaJson(dados: unknown, status = 200, cabecalhos: Record<string, string> = {}) {
  return Response.json(dados, { status, headers: { ...SEM_CACHE, ...cabecalhos } })
}

/** 201 com `Location` apontando para o recurso criado. */
export function respostaCriada(dados: unknown, local: string) {
  return respostaJson(dados, 201, { Location: local })
}

function respostaErro(corpo: CorpoErro, status: number) {
  return respostaJson(corpo, status)
}

/** Primeiro IP de X-Forwarded-For (o cliente, atras do proxy reverso). So aceita IP valido: a coluna e `inet`. */
function ipDaRequisicao(req: NextRequest): string | null {
  const candidato =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || null
  return candidato && isIP(candidato) ? candidato : null
}

/** zod -> { campo: mensagem } (a primeira mensagem de cada campo). */
function camposDoZod(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const issue of erro.issues) {
    const chave = issue.path.length ? issue.path.join('.') : '_'
    campos[chave] ??= issue.message
  }
  return campos
}

export function rota<C = unknown>(handler: (contexto: ContextoRota, req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      const usuario = await obterSessao()
      if (!usuario) throw erroNaoAutenticado()

      const resultado = await handler(
        { usuario, auditoria: { ip: ipDaRequisicao(req), userAgent: req.headers.get('user-agent') } },
        req,
        ctx,
      )
      return resultado instanceof Response ? resultado : respostaJson(resultado ?? null)
    } catch (erro) {
      unstable_rethrow(erro)
      if (erro instanceof ErroApi) return respostaErro(erro.corpo(), erro.status)
      if (erro instanceof z.ZodError) {
        const e = erroValidacao(camposDoZod(erro))
        return respostaErro(e.corpo(), e.status)
      }
      if (erro instanceof SyntaxError) {
        // req.json() com corpo que nao e JSON.
        const e = erroValidacao({}, 'Corpo da requisição inválido.')
        return respostaErro(e.corpo(), e.status)
      }
      const idRastreio = randomUUID()
      log.error({ err: erro, idRastreio, metodo: req.method, caminho: req.nextUrl.pathname }, 'erro inesperado na rota')
      return respostaErro(
        { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro inesperado. Tente novamente; se persistir, informe o código ao suporte.', idRastreio } },
        500,
      )
    }
  }
}
