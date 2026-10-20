import { rota } from '@/lib/server/http/rota'
import { listarContratosProtheus } from '@/lib/server/servicos/protheus'

/** GET /api/v1/contratos-protheus -- cache da ultima sincronizacao (feita pelo worker). */
export const GET = rota(async () => listarContratosProtheus())
