import { sqlCru } from '@/lib/server/db/cliente'
import { log } from '@/lib/server/log'

/**
 * GET /api/health -- usado pelo healthcheck do Docker. Sem sessao.
 *
 * Confere so o banco (select 1 em ate 2 s). De proposito NAO consulta os Apps
 * Princesa: uma queda la nao pode fazer o Docker reiniciar este app, que
 * segue funcionando para quem ja tem sessao.
 */
const TEMPO_LIMITE_MS = 2000

export async function GET() {
  const cabecalhos = { 'Cache-Control': 'no-store' }
  try {
    await Promise.race([
      sqlCru()`select 1`,
      new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error('timeout')), TEMPO_LIMITE_MS)),
    ])
    return Response.json({ ok: true }, { headers: cabecalhos })
  } catch (erro) {
    log.warn({ err: erro }, 'healthcheck: banco indisponível')
    return Response.json({ ok: false }, { status: 503, headers: cabecalhos })
  }
}
