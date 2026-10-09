import { rota } from '@/lib/server/http/rota'
import { filaAlertas } from '@/lib/server/servicos/painel'

/** GET /api/v1/alertas -- vencidos, vencimento iminente e prazo de decisao. */
export const GET = rota(async ({ usuario }) => filaAlertas(usuario))
