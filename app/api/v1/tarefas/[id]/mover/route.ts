import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { moverTarefa } from '@/lib/server/servicos/tarefas'
import { esquemaMoverTarefa } from '@/lib/shared/tarefas'

/** POST /api/v1/tarefas/{id}/mover  { coluna }  -- qualquer coluna; a mesma coluna não muda nada. */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/tarefas/[id]/mover'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { coluna } = esquemaMoverTarefa.parse(await req.json())
  return moverTarefa(usuario, id, coluna, auditoria)
})
