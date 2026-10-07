import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { desativarOpcao } from '@/lib/server/servicos/opcoes'

/** POST /api/v1/opcoes-cadastro/{id}/desativar  (admin) -- o "remover" da tela. */
export const POST = rota(async ({ usuario, auditoria }, _req, ctx: RouteContext<'/api/v1/opcoes-cadastro/[id]/desativar'>) => {
  return desativarOpcao(usuario, idDaUrl((await ctx.params).id), auditoria)
})
