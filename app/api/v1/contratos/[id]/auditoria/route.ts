import { z } from 'zod'
import { idDaUrl, parametrosDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { auditoriaDoContrato } from '@/lib/server/servicos/contratos'

const esquema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
  incluirAcessos: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

/** GET /api/v1/contratos/{id}/auditoria -- eventos do contrato, mais recentes primeiro. */
export const GET = rota(async ({ usuario }, req, ctx: RouteContext<'/api/v1/contratos/[id]/auditoria'>) => {
  const id = idDaUrl((await ctx.params).id)
  return auditoriaDoContrato(usuario, id, esquema.parse(parametrosDaUrl(req.nextUrl)))
})
