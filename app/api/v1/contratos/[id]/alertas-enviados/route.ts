import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { alertasDoContrato } from '@/lib/server/servicos/alertas'

/** GET /api/v1/contratos/{id}/alertas-enviados -- e-mails de alerta do contrato (enviados e falhas), mais recentes primeiro. */
export const GET = rota(async ({ usuario }, _req, ctx: RouteContext<'/api/v1/contratos/[id]/alertas-enviados'>) => {
  return alertasDoContrato(usuario, idDaUrl((await ctx.params).id))
})
