/**
 * Content-Security-Policy das páginas (docs/BACKEND_IMPLEMENTATION.md §12).
 *
 * Um nonce novo por requisição (gerado no proxy.ts): o Next o aplica sozinho
 * nos próprios scripts, e o layout o põe no script inline do tema. Sem o
 * nonce, nenhum script inline roda -- um XSS que injete <script> não executa.
 *
 * - `style-src 'unsafe-inline'`: a interface usa `style={{ ... }}` (variáveis
 *   de cor por quadro); estilo injetado não executa código.
 * - Sem `upgrade-insecure-requests`: o app roda em HTTP na rede interna, e a
 *   diretiva faria o navegador pedir tudo em HTTPS.
 * - Em desenvolvimento, `'unsafe-eval'`: o React usa eval para as pilhas de erro.
 */
export function politicaCsp(nonce: string, desenvolvimento = process.env.NODE_ENV === 'development'): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desenvolvimento ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function gerarNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64')
}
