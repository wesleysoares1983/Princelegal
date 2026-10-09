import { erroValidacao } from '@/lib/server/http/erros'
import { idDaUrl } from '@/lib/server/http/parametros'
import { respostaCriada, rota } from '@/lib/server/http/rota'
import { lerMultipart, validarArquivo } from '@/lib/server/http/upload'
import { enviarNovaVersao } from '@/lib/server/servicos/documentos'

/** POST /api/v1/documentos/{id}/versoes  multipart: arquivo -- nova versao do mesmo documento. */
export const POST = rota(async ({ usuario, auditoria }, req, ctx: RouteContext<'/api/v1/documentos/[id]/versoes'>) => {
  const id = idDaUrl((await ctx.params).id)
  const { arquivo } = await lerMultipart(req)
  if (!arquivo) throw erroValidacao({ arquivo: 'Escolha o arquivo.' })
  const doc = await enviarNovaVersao(usuario, id, validarArquivo(arquivo), auditoria)
  return respostaCriada(doc, `/api/v1/documentos/${doc.id}`)
})
