import { idDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { editarContrato, obterContrato, recusarCamposForaDaEdicao } from '@/lib/server/servicos/contratos'
import { esquemaEditarContrato, type DadosEditarContrato } from '@/lib/shared/contratos'

type Ctx = RouteContext<'/api/v1/contratos/[id]'>

/** GET /api/v1/contratos/{id} -- detalhe (404 tambem para restrito que o usuario nao ve). */
export const GET = rota(async ({ usuario, auditoria }, _req, ctx: Ctx) => {
  return obterContrato(usuario, idDaUrl((await ctx.params).id), auditoria)
})

/** PATCH /api/v1/contratos/{id}  { versao, ...campos }  -- vigencia e valor so por aditivo. */
export const PATCH = rota(async ({ usuario, auditoria }, req, ctx: Ctx) => {
  const id = idDaUrl((await ctx.params).id)
  const corpo = await req.json()
  recusarCamposForaDaEdicao(corpo)
  const dados = esquemaEditarContrato.parse(corpo) as DadosEditarContrato
  return editarContrato(usuario, id, dados, auditoria)
})
