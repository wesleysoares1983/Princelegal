/**
 * Roda uma vez quando o servidor sobe, antes da primeira requisicao.
 *
 * Confere o .env inteiro: faltando variavel, o servidor nem fica de pe -- e
 * a mensagem diz exatamente qual, em vez de um erro confuso no meio de um
 * login ou de uma consulta ao banco.
 *
 * Tambem agenda a sincronizacao diaria com o Protheus as 9h e faz uma
 * sincronizacao inicial se ainda nao existir cache (ex.: primeiro deploy).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { validarAmbiente } = await import('./lib/server/config')
  validarAmbiente()
  const { verificarPastaGravavel } = await import('./lib/server/armazenamento')
  await verificarPastaGravavel()

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
