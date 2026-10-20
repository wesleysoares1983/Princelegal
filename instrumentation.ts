/**
 * Roda uma vez quando o servidor Next inicia. Agenda a sincronização diária
 * com o Protheus às 9h e faz uma sincronização inicial se ainda não existir
 * cache (ex.: primeiro deploy).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const cron = await import('node-cron')
  const { lerCacheContratosProtheus, sincronizarContratosProtheus } = await import('./lib/protheusSync')

  cron.schedule(
    '0 9 * * *',
    () => {
      sincronizarContratosProtheus().catch((erro) =>
        console.error('[protheus] falha na sincronização diária', erro),
      )
    },
    { timezone: 'America/Sao_Paulo' },
  )

  const cacheAtual = await lerCacheContratosProtheus()
  if (!cacheAtual) {
    sincronizarContratosProtheus().catch((erro) =>
      console.error('[protheus] falha na sincronização inicial', erro),
    )
  }
}
