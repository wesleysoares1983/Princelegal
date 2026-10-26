import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { removerTarefa } from '@/lib/server/servicos/tarefas'
import { esquemaRemoverTarefa } from '@/lib/shared/tarefas'

/** DELETE /api/v1/tarefas/{id}  { justificativa }  -- exclusão lógica: a linha fica, sai do quadro. */
export const DELETE = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/tarefas/[id]'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { justificativa } = esquemaRemoverTarefa.parse(await req.json())
  return removerTarefa(usuario, id, justificativa, auditoria)
})
