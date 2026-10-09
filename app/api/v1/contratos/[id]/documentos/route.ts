import { z } from 'zod'
import { erroValidacao } from '@/lib/server/http/erros'
import { idDaUrl, parametrosDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { lerMultipart, validarArquivo } from '@/lib/server/http/upload'
import { enviarDocumento, listarDocumentos } from '@/lib/server/servicos/documentos'
import { esquemaNomeDocumento, esquemaTipoDocumento } from '@/lib/shared/documentos'

type Ctx = RouteContext<'/api/v1/contratos/[id]/documentos'>

const sim = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true')

/** GET /api/v1/contratos/{id}/documentos?incluirRemovidos=true&incluirVersoes=true */
export const GET = rota(async ({ usuario }, req, ctx: Ctx) => {
  const id = idDaUrl((await ctx.params).id)
  const opcoes = z.object({ incluirRemovidos: sim, incluirVersoes: sim }).parse(parametrosDaUrl(req.nextUrl))
  return listarDocumentos(usuario, id, opcoes)
})

/** POST /api/v1/contratos/{id}/documentos  multipart: arquivo, tipo, nome? */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: Ctx) => {
  const id = idDaUrl((await ctx.params).id)
  const { campos, arquivo } = await lerMultipart(req)
  const tipo = esquemaTipoDocumento.parse(campos.tipo)
  const nome = esquemaNomeDocumento.parse(campos.nome)
  if (!arquivo) throw erroValidacao({ arquivo: 'Escolha o arquivo.' })
  const doc = await enviarDocumento(usuario, id, { arquivo: validarArquivo(arquivo), tipo, nome }, auditoria)
  return respostaCriada(doc, `/api/v1/documentos/${doc.id}`)
})
