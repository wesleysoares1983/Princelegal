/**
 * Roda uma vez quando o servidor sobe, antes da primeira requisicao.
 *
 * Confere o .env inteiro: faltando variavel, o servidor nem fica de pe -- e
 * a mensagem diz exatamente qual, em vez de um erro confuso no meio de um
 * login ou de uma consulta ao banco.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { validarAmbiente } = await import('./lib/server/config')
  validarAmbiente()
}
