import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { removerDocumento } from '@/lib/server/servicos/documentos'
import { esquemaRemoverDocumento } from '@/lib/shared/documentos'

/** DELETE /api/v1/documentos/{id}  { motivo }  -- remocao logica: o arquivo fica, a linha some da lista. */
export const DELETE = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/documentos/[id]'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { motivo } = esquemaRemoverDocumento.parse(await req.json())
  return removerDocumento(usuario, id, motivo, auditoria)
})
