import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token assinado (HMAC-SHA256): `<dados em base64url>.<assinatura>`.
 *
 * Assinado, nao cifrado -- quem tem o cookie consegue ler o conteudo (nome,
 * e-mail, matricula do proprio usuario), mas nao consegue altera-lo sem o
 * segredo. Todo token carrega `exp` (segundos) e e recusado depois dele.
 */

function hmac(corpo: string, segredo: string): string {
  return createHmac('sha256', segredo).update(corpo).digest('base64url')
}

export function assinar(dados: { exp: number } & Record<string, unknown>, segredo: string): string {
  const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url')
  return `${corpo}.${hmac(corpo, segredo)}`
}

export function verificar<T extends { exp: number }>(token: string | undefined, segredo: string): T | null {
  if (!token) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [corpo, assinatura] = partes

  const esperada = Buffer.from(hmac(corpo, segredo))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null

  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'))
    if (typeof dados?.exp !== 'number' || dados.exp * 1000 <= Date.now()) return null
    return dados as T
  } catch {
    return null
  }
}

export const agoraEmSegundos = () => Math.floor(Date.now() / 1000)
