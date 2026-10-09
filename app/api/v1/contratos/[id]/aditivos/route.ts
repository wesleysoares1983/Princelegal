import { idDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { lerCorpoComArquivo } from '@/lib/server/http/upload'
import { registrarAditivo } from '@/lib/server/servicos/aditivos'
import { esquemaAditivo } from '@/lib/shared/contratos'

/**
 * POST /api/v1/contratos/{id}/aditivos
 * JSON `{ versao, dataInicio, dataFim, valorMensal, observacao?, confirmarEncurtamento? }`,
 * ou multipart com `dados` + `arquivo` (o aditivo assinado).
 */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/contratos/[id]/aditivos'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { corpo, arquivo } = await lerCorpoComArquivo(req)
  const contrato = await registrarAditivo(usuario, id, esquemaAditivo.parse(corpo), auditoria, undefined, arquivo)
  return respostaCriada(contrato, `/api/v1/contratos/${contrato.id}`)
})
