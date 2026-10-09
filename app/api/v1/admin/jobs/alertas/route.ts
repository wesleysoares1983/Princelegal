import { z } from 'zod'
import { registrarAuditoria } from '@/lib/server/auditoria'
import { exigirAdmin } from '@/lib/server/auth'
import { db } from '@/lib/server/db/cliente'
import { rota } from '@/lib/server/http/rota'
import { executarAlertas } from '@/lib/server/servicos/alertas'

const esquema = z.object({ simular: z.boolean().default(true) })

/**
 * POST /api/v1/admin/jobs/alertas  { simular?: boolean = true }  (admin)
 *
 * Roda a mesma rotina do worker. Com `simular` (o padrão), só mostra o que
 * seria enviado hoje -- sem e-mail e sem gravar nada. Mesma trava do worker.
 */
export const POST = rota(async ({ usuario, auditoria }, req) => {
  exigirAdmin(usuario)
  const { simular } = esquema.parse(await req.json().catch(() => ({})))
  const resultado = await executarAlertas({ simular })
  if (!simular && !resultado.emAndamento) {
    await registrarAuditoria(
      db,
      {
        usuario: { matricula: usuario.matricula, nome: usuario.nome },
        categoria: 'sistema',
        acao: 'sistema.alertas_executados_manualmente',
        descricao: `Executou os alertas manualmente: ${resultado.enviados.length} e-mail(s), ${resultado.falhas.length} falha(s)`,
        dados: { enviados: resultado.enviados.length, falhas: resultado.falhas.length },
      },
      auditoria,
    )
  }
  return resultado
})
