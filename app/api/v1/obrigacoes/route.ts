import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { rota } from '@/lib/server/http/rota'
import { listarObrigacoes } from '@/lib/server/servicos/obrigacoes'
import { esquemaListarObrigacoes } from '@/lib/shared/obrigacoes'

/**
 * GET /api/v1/obrigacoes?busca=&responsavel=&vigenciaDe=&vigenciaAte=&situacao=&atrasadas=true&pagina=
 * Obrigações de todos os contratos que o usuário vê, por vencimento.
 */
export const GET = rota(async ({ usuario }, req) => listarObrigacoes(usuario, esquemaListarObrigacoes.parse(parametrosDaUrl(req.nextUrl))))
