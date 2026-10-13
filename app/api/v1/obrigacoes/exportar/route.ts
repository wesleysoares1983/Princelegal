import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { esquemaExportarObrigacoes, exportarObrigacoes } from '@/lib/server/servicos/exportacoes'

/**
 * GET /api/v1/obrigacoes/exportar?formato=xlsx|csv&<filtros de GET /obrigacoes>
 * Baixa a lista com os filtros da tela (só de contratos visíveis, até 10 000).
 */
export const GET = rota(async ({ usuario, auditoria }, req) =>
  exportarObrigacoes(usuario, esquemaExportarObrigacoes.parse(parametrosDaUrl(req.nextUrl)), auditoria),
)
