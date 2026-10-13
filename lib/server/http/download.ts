import 'server-only'

/** Nome para o cabecalho: ASCII simples em `filename`, o nome real (UTF-8) em `filename*` (RFC 6266). */
export function disposicao(tipo: 'attachment' | 'inline', nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

/** Resposta de download: sem cache, sem "sniffing" de tipo. */
export function respostaArquivo(opcoes: {
  corpo: BodyInit
  mime: string
  nome: string
  tamanho?: number
  inline?: boolean
}): Response {
  const { corpo, mime, nome, inline = false } = opcoes
  const tamanho = opcoes.tamanho ?? (corpo instanceof Uint8Array ? corpo.byteLength : undefined)
  return new Response(corpo, {
    headers: {
      'Content-Type': mime,
      ...(tamanho !== undefined ? { 'Content-Length': String(tamanho) } : {}),
      'Content-Disposition': disposicao(inline ? 'inline' : 'attachment', nome),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
