/**
 * Tamanho maximo de upload (MB). O proxy.ts roda antes das rotas de upload e,
 * por padrao, o Next so repassa os primeiros 10 MB do corpo de quem passa por
 * ele -- o resto e cortado em silencio (so um aviso no log). O limite abaixo
 * fica acima do maior upload aceito (+5 MB de folga para o envelope multipart);
 * quem recusa o arquivo grande demais e a rota, com 413.
 */
const UPLOAD_MAX_MB = Number(process.env.UPLOAD_MAX_MB) || 25

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    proxyClientMaxBodySize: `${UPLOAD_MAX_MB + 5}mb`,
  },

  async headers() {
    return [
      {
        source: '/:caminho*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
