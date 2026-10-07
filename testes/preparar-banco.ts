import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import type { TestProject } from 'vitest/node'
import { subirPostgresEmbutido, type ConexaoTeste } from './postgres-embutido'

/**
 * Antes dos testes de banco: apaga tudo do banco descartavel e aplica as
 * migracoes do zero -- os testes sempre partem do mesmo estado que uma
 * instalacao nova teria (inclusive as opcoes iniciais da migracao 0002).
 *
 * Qual banco: o do docker-compose.dev.yml / do CI, se estiver de pe; senao,
 * um PostgreSQL 14 embutido (testes/postgres-embutido.ts), subido aqui e
 * parado no fim.
 */
export default async function preparar(projeto: TestProject) {
  const env = projeto.config.env as Record<string, string>
  const conexao: ConexaoTeste = {
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
    database: env.POSTGRES_DATABASE,
    username: env.POSTGRES_USERNAME,
    password: env.POSTGRES_PASSWORD,
  }

  // Este setup APAGA o esquema inteiro. Trava de seguranca: so roda num banco
  // cujo nome deixa claro que e descartavel -- nunca no princelegal_dev nem em
  // producao, mesmo que alguem aponte POSTGRES_TEST_* para la por engano.
  if (!/_teste$/.test(conexao.database)) {
    throw new Error(
      `Recusado: o banco de teste precisa terminar em "_teste" (recebido "${conexao.database}"). ` +
        'Os testes de banco apagam o esquema inteiro antes de rodar.',
    )
  }

  let parar: (() => Promise<void>) | null = null
  if (!(await alcancavel(conexao))) {
    if (conexao.host !== 'localhost') {
      throw new Error(`Banco de teste indisponível em ${conexao.host}:${conexao.port}.`)
    }
    console.log('[testes] sem banco em localhost:%d -- subindo PostgreSQL 14 embutido…', conexao.port)
    parar = await subirPostgresEmbutido(conexao)
  }

  const sql = postgres({ ...conexao, max: 1, onnotice: () => {} })
  try {
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;')
    // Extensoes ficam no esquema public: recria-las e papel da migracao 0000.
    await migrate(drizzle({ client: sql }), { migrationsFolder: './drizzle', migrationsTable: 'migracoes', migrationsSchema: 'public' })
  } finally {
    await sql.end()
  }

  return async () => {
    await parar?.()
  }
}

async function alcancavel(c: ConexaoTeste): Promise<boolean> {
  const sql = postgres({ ...c, max: 1, connect_timeout: 3, onnotice: () => {} })
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {})
  }
}
