import { rota } from '@/lib/server/http/rota'
import { painel } from '@/lib/server/servicos/painel'

/** GET /api/v1/painel -- numeros e listas da tela de Inicio. */
export const GET = rota(async ({ usuario }) => painel(usuario))
