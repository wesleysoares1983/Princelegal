import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { editarOpcao } from '@/lib/server/servicos/opcoes'
import { esquemaEditarOpcao } from '@/lib/shared/opcoes'

/** PATCH /api/v1/opcoes-cadastro/{id}  { versao, valor?, ordem? }  (admin) -- renomear/reordenar. */
export const PATCH = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/opcoes-cadastro/[id]'>) => {
  const id = idDaUrl((await ctx.params).id)
  const dados = esquemaEditarOpcao.parse(await req.json())
  return editarOpcao(usuario, id, dados, auditoria)
})
