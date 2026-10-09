import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { lerCorpoComArquivo } from '@/lib/server/http/upload'
import { criarContrato, listarContratos } from '@/lib/server/servicos/contratos'
import { esquemaCriarContrato, esquemaListarContratos } from '@/lib/shared/contratos'

/**
 * GET  /api/v1/contratos?status=&busca=&renovacaoAutomatica=sim&ordenar=&pagina=&porPagina=
 *      Lista paginada; restritos que o usuario nao ve ficam de fora (inclusive do total).
 * POST /api/v1/contratos  -- cadastro. JSON, ou multipart com `dados` (o
 *      mesmo JSON, como texto) + `arquivo` (o contrato assinado); com arquivo,
 *      contrato e documento nascem juntos.
 */
export const GET = rota(async ({ usuario }, req) => {
  return listarContratos(usuario, esquemaListarContratos.parse(parametrosDaUrl(req.nextUrl)))
})

export const POST = rota(async ({ usuario, auditoria }, req) => {
  const { corpo, arquivo } = await lerCorpoComArquivo(req)
  const contrato = await criarContrato(usuario, esquemaCriarContrato.parse(corpo), auditoria, undefined, arquivo)
  return respostaCriada(contrato, `/api/v1/contratos/${contrato.id}`)
})
