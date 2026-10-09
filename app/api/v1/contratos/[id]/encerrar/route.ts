import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { encerrarContrato } from '@/lib/server/servicos/contratos'
import { esquemaEncerrar } from '@/lib/shared/contratos'

/** POST /api/v1/contratos/{id}/encerrar  { versao, data?, justificativa }  (admin) */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/contratos/[id]/encerrar'>) => {
  const id = idDaUrl((await ctx.params).id)
  return encerrarContrato(usuario, id, esquemaEncerrar.parse(await req.json()), auditoria)
})
