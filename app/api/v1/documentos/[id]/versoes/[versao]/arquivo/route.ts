import { erroNaoEncontrado } from '@/lib/server/http/erros'
import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { abrirArquivo } from '@/lib/server/servicos/documentos'

/** Nome para o cabecalho: ASCII simples em `filename`, o nome real (UTF-8) em `filename*` (RFC 6266). */
function disposicao(tipo: 'attachment' | 'inline', nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

/**
 * GET /api/v1/documentos/{id}/versoes/{versao|atual}/arquivo[?inline=1]
 *
 * Baixa o arquivo (cada download vai para a trilha de acesso). `inline=1`
 * abre no navegador -- so para PDF; Word sempre baixa.
 */
export const GET = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/documentos/[id]/versoes/[versao]/arquivo'>) => {
  const p = await ctx.params
  const id = idDaUrl(p.id)
  const versao = p.versao === 'atual' ? 'atual' : Number(p.versao)
  if (versao !== 'atual' && (!Number.isInteger(versao) || versao < 1)) throw erroNaoEncontrado('Versão não encontrada.')

  const arquivo = await abrirArquivo(usuario, id, versao, auditoria)
  const inline = req.nextUrl.searchParams.get('inline') === '1' && arquivo.mime === 'application/pdf'
  return new Response(arquivo.corpo, {
    headers: {
      'Content-Type': arquivo.mime,
      'Content-Length': String(arquivo.tamanho),
      'Content-Disposition': disposicao(inline ? 'inline' : 'attachment', arquivo.nomeArquivo),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
})
