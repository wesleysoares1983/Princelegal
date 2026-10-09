import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { reabrirContrato } from '@/lib/server/servicos/contratos'
import { esquemaReabrir } from '@/lib/shared/contratos'

/** POST /api/v1/contratos/{id}/reabrir  { versao, justificativa }  (admin; so encerramento manual) */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/contratos/[id]/reabrir'>) => {
  const id = idDaUrl((await ctx.params).id)
  return reabrirContrato(usuario, id, esquemaReabrir.parse(await req.json()), auditoria)
})
