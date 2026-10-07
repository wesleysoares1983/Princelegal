import { existsSync } from 'node:fs'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import postgres from 'postgres'

/**
 * PostgreSQL 14 de verdade, baixado pelo npm (pacote embedded-postgres),
 * para os testes de banco rodarem sem Docker -- o caso desta rede, em que o
 * Docker do WSL nao consegue baixar imagens.
 *
 * Os dados ficam em node_modules/.cache: o primeiro start inicializa o
 * diretorio (~20 s); os seguintes so sobem o servidor (~2 s). O esquema e
 * recriado a cada execucao pelo globalSetup, entao reaproveitar o diretorio
 * nao vaza estado entre execucoes.
 */

const DIRETORIO = join(process.cwd(), 'node_modules', '.cache', 'pg-teste')

export interface ConexaoTeste {
  host: string
  port: number
  database: string
  username: string
  password: string
}

/** Sobe o Postgres embutido e garante o banco; devolve a funcao que o para. */
export async function subirPostgresEmbutido(c: ConexaoTeste): Promise<() => Promise<void>> {
  const pg = new EmbeddedPostgres({
    databaseDir: DIRETORIO,
    user: c.username,
    password: c.password,
    port: c.port,
    persistent: true,
    // Igual ao servidor corporativo: UTF8. Sem isto, no Windows o initdb usa
    // WIN1252 e recusa caracteres como "→". Locale C: os nomes de locale do
    // Windows nao batem com os do Linux, e a ordenacao do app ja ignora
    // acento e maiuscula (f_unaccent + lower).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  })

  if (!existsSync(join(DIRETORIO, 'PG_VERSION'))) await pg.initialise()
  await pg.start()

  const sql = postgres({ ...c, database: 'postgres', max: 1, onnotice: () => {} })
  try {
    const [existe] = await sql`select pg_encoding_to_char(encoding) as codificacao from pg_database where datname = ${c.database}`
    if (existe && existe.codificacao !== 'UTF8') await sql.unsafe(`drop database "${c.database}"`)
    if (!existe || existe.codificacao !== 'UTF8') {
      await sql.unsafe(`create database "${c.database}" encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`)
    }
  } finally {
    await sql.end()
  }

  return () => pg.stop()
}
