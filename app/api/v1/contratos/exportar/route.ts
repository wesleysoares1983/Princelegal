import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { esquemaExportarContratos, exportarContratos } from '@/lib/server/servicos/exportacoes'

/**
 * GET /api/v1/contratos/exportar?formato=xlsx|csv&<filtros de GET /contratos>
 * Baixa a lista com os filtros da tela (só contratos visíveis, até 10 000).
 */
export const GET = rota(async ({ usuario, auditoria }, req) =>
  exportarContratos(usuario, esquemaExportarContratos.parse(parametrosDaUrl(req.nextUrl)), auditoria),
)
