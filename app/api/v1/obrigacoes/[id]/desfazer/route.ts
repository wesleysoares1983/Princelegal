import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { desfazerCumprimento } from '@/lib/server/servicos/obrigacoes'

/** POST /api/v1/obrigacoes/{id}/desfazer  -- admin ou quem marcou como cumprida. */
export const POST = rota(async ({ usuario, auditoria }, _req, ctx: RouteContext<'/api/v1/obrigacoes/[id]/desfazer'>) => {
  return desfazerCumprimento(usuario, idDaUrl((await ctx.params).id), auditoria)
})
