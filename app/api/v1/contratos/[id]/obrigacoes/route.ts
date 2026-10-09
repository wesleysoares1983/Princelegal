import { idDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { criarObrigacao, obrigacoesDoContrato } from '@/lib/server/servicos/obrigacoes'
import { esquemaCriarObrigacao } from '@/lib/shared/obrigacoes'

type Ctx = RouteContext<'/api/v1/contratos/[id]/obrigacoes'>

/** GET /api/v1/contratos/{id}/obrigacoes -- todas as situações, para a aba do contrato. */
export const GET = rota(async ({ usuario }, _req, ctx: Ctx) => obrigacoesDoContrato(usuario, idDaUrl((await ctx.params).id)))

/** POST /api/v1/contratos/{id}/obrigacoes  { descricao, responsavel, data, recorrencia } -> `{ obrigacao, avisos }` */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: Ctx) => {
  const id = idDaUrl((await ctx.params).id)
  const r = await criarObrigacao(usuario, id, esquemaCriarObrigacao.parse(await req.json()), auditoria)
  return respostaCriada(r, `/api/v1/obrigacoes/${r.obrigacao.id}`)
})
