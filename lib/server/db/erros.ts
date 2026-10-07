/**
 * Reconhece erros do PostgreSQL atraves do invólucro do Drizzle.
 *
 * O Drizzle relanca o erro do driver como DrizzleQueryError ("Failed query:
 * ..."); o erro original, com `code` e `constraint_name`, fica em `cause`.
 */

interface ErroPg {
  code?: string
  constraint_name?: string
}

function erroPg(erro: unknown): ErroPg | null {
  for (let atual: unknown = erro, i = 0; atual && i < 5; atual = (atual as { cause?: unknown }).cause, i++) {
    if (typeof (atual as ErroPg).code === 'string') return atual as ErroPg
  }
  return null
}

/** Violacao de UNIQUE (23505), opcionalmente de uma restricao especifica. */
export function ehViolacaoUnica(erro: unknown, restricao?: string): boolean {
  const pg = erroPg(erro)
  return pg?.code === '23505' && (!restricao || pg.constraint_name === restricao)
}
