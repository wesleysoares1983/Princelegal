import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { criarTarefa, listarTarefas } from '@/lib/server/servicos/tarefas'
import { esquemaCriarTarefa, esquemaListarTarefas } from '@/lib/shared/tarefas'

/**
 * GET  /api/v1/tarefas?limiteConcluidas=  -- o quadro: abertas + concluídas mais recentes.
 * POST /api/v1/tarefas  { titulo, descricao?, responsavel?, prazo?, coluna, contratoId? }  (admin)
 */
export const GET = rota(async ({ usuario }, req) => listarTarefas(usuario, esquemaListarTarefas.parse(parametrosDaUrl(req.nextUrl))))

export const POST = rota(async ({ usuario, auditoria }, req) => {
  const tarefa = await criarTarefa(usuario, esquemaCriarTarefa.parse(await req.json()), auditoria)
  return respostaCriada(tarefa, `/api/v1/tarefas/${tarefa.id}`)
})
