import { lerCacheContratosProtheus, sincronizarContratosProtheus } from '@/lib/protheusSync'

export async function GET() {
  const cache = (await lerCacheContratosProtheus()) ?? (await sincronizarContratosProtheus())
  return Response.json(cache)
}
