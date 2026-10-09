import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { restaurarDocumento } from '@/lib/server/servicos/documentos'

/** POST /api/v1/documentos/{id}/restaurar  (admin) */
export const POST = rota(async ({ usuario, auditoria }, _req, ctx: RouteContext<'/api/v1/documentos/[id]/restaurar'>) => {
  return restaurarDocumento(usuario, idDaUrl((await ctx.params).id), auditoria)
})
