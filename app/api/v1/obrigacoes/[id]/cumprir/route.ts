import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { cumprirObrigacao } from '@/lib/server/servicos/obrigacoes'
import { esquemaCumprir } from '@/lib/shared/obrigacoes'

/** POST /api/v1/obrigacoes/{id}/cumprir  { cumpridaEm?, observacao? } -> `{ obrigacao, proxima }` */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/obrigacoes/[id]/cumprir'>) => {
  const id = idDaUrl((await ctx.params).id)
  const corpo = await req.json().catch(() => ({}))
  return cumprirObrigacao(usuario, id, esquemaCumprir.parse(corpo ?? {}), auditoria)
})
