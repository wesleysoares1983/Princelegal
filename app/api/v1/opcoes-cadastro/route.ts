import { rota, respostaCriada } from '@/lib/server/http/rota'
import { parametrosDaUrl } from '@/lib/server/http/parametros'
import { criarOpcao, listarOpcoes } from '@/lib/server/servicos/opcoes'
import { esquemaCriarOpcao, esquemaListarOpcoes } from '@/lib/shared/opcoes'

/**
 * GET  /api/v1/opcoes-cadastro?campo=&incluirInativas=true
 *      Qualquer usuario; inativas so para admin. `{ [campo]: Opcao[] }`.
 * POST /api/v1/opcoes-cadastro  { campo, valor }  (admin)
 */
export const GET = rota(async ({ usuario }, req) => {
  const filtro = esquemaListarOpcoes.parse(parametrosDaUrl(req.nextUrl))
  return listarOpcoes(usuario, filtro)
})

export const POST = rota(async ({ usuario, auditoria }, req) => {
  const dados = esquemaCriarOpcao.parse(await req.json())
  const opcao = await criarOpcao(usuario, dados, auditoria)
  return respostaCriada(opcao, `/api/v1/opcoes-cadastro/${opcao.id}`)
})
