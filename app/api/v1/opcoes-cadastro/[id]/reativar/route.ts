import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { reativarOpcao } from '@/lib/server/servicos/opcoes'

/** POST /api/v1/opcoes-cadastro/{id}/reativar  (admin) */
export const POST = rota(async ({ usuario, auditoria }, _req, ctx: RouteContext<'/api/v1/opcoes-cadastro/[id]/reativar'>) => {
  return reativarOpcao(usuario, idDaUrl((await ctx.params).id), auditoria)
})
