import { z } from 'zod'
import { erroNaoEncontrado } from './erros'

const uuid = z.uuid()

/**
 * Id vindo da URL. Um id malformado e tratado como "nao existe" (404), nao
 * como erro de validacao: para quem chama, `/opcoes-cadastro/abc` e um
 * recurso que nao existe -- e assim o valor nunca chega ao banco como uuid invalido.
 */
export function idDaUrl(valor: string): string {
  if (!uuid.safeParse(valor).success) throw erroNaoEncontrado()
  return valor
}

/** Query string -> objeto simples, para validar com zod. */
export function parametrosDaUrl(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries())
}
