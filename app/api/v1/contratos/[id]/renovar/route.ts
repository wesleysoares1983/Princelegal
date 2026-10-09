import { idDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { lerCorpoComArquivo } from '@/lib/server/http/upload'
import { renovarContrato } from '@/lib/server/servicos/aditivos'
import { esquemaRenovar, type DadosRenovar } from '@/lib/shared/contratos'

/**
 * POST /api/v1/contratos/{id}/renovar
 * JSON `{ versao, dataInicio, dataFim, valorMensal, ...campos a mudar }`, ou
 * multipart com `dados` + `arquivo` (a renovacao assinada). Responde 201 com
 * o contrato NOVO; o antigo fica encerrado como "renovado".
 */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/contratos/[id]/renovar'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { corpo, arquivo } = await lerCorpoComArquivo(req)
  const novo = await renovarContrato(usuario, id, esquemaRenovar.parse(corpo) as DadosRenovar, auditoria, undefined, arquivo)
  return respostaCriada(novo, `/api/v1/contratos/${novo.id}`)
})
