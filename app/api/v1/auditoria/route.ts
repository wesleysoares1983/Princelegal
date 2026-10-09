import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { listarAuditoria } from '@/lib/server/servicos/painel'
import { esquemaListarAuditoria } from '@/lib/shared/contratos'

/**
 * GET /api/v1/auditoria -- trilha geral. Nao-admin ve so eventos de contrato,
 * documento e obrigacao dos contratos que pode ver; admin ve tudo (acessos
 * com `incluirAcessos=true`).
 */
export const GET = rota(async ({ usuario }, req) => {
  return listarAuditoria(usuario, esquemaListarAuditoria.parse(parametrosDaUrl(req.nextUrl)))
})
