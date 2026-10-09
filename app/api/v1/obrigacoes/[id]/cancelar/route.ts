import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { cancelarObrigacao } from '@/lib/server/servicos/obrigacoes'
import { esquemaCancelarObrigacao } from '@/lib/shared/obrigacoes'

/** POST /api/v1/obrigacoes/{id}/cancelar  { motivo }  -- encerra a série, se recorrente. */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/obrigacoes/[id]/cancelar'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { motivo } = esquemaCancelarObrigacao.parse(await req.json())
  return cancelarObrigacao(usuario, id, motivo, auditoria)
})
