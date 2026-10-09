import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { anularAditivo } from '@/lib/server/servicos/aditivos'
import { esquemaAnularAditivo } from '@/lib/shared/contratos'

/** POST /api/v1/contratos/{id}/aditivos/{aditivoId}/anular  { versao, justificativa }  (admin; so o ultimo aditivo valido) */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/contratos/[id]/aditivos/[aditivoId]/anular'>) => {
  const p = await ctx.params
  return anularAditivo(usuario, idDaUrl(p.id), idDaUrl(p.aditivoId), esquemaAnularAditivo.parse(await req.json()), auditoria)
})
