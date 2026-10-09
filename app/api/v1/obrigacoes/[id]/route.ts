import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { editarObrigacao } from '@/lib/server/servicos/obrigacoes'
import { esquemaEditarObrigacao } from '@/lib/shared/obrigacoes'

/** PATCH /api/v1/obrigacoes/{id}  { descricao?, responsavel?, data?, recorrencia? }  -- só pendentes, contrato aberto. */
export const PATCH = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/obrigacoes/[id]'>) => {
  const id = idDaUrl((await ctx.params).id)
  return editarObrigacao(usuario, id, esquemaEditarObrigacao.parse(await req.json()), auditoria)
})
