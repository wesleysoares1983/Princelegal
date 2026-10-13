/**
 * Aplica as migrações (drizzle/) no banco do .env e sai. Na produção é o
 * serviço `migrate` do docker-compose.yml, que roda antes do app e do worker;
 * empacotado em dist/migrar.cjs para a imagem não precisar do drizzle-kit.
 *
 * Uma conexão só, com trava (advisory lock): duas execuções ao mesmo tempo
 * esperam uma pela outra em vez de aplicar a mesma migração duas vezes.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { configBanco } from '@/lib/server/config'

const TRAVA = 7_401_002

if (existsSync('.env')) process.loadEnvFile('.env')

async function main() {
  const c = configBanco()
  const pasta = process.env.MIGRACOES_DIR ?? join(__dirname, '..', 'drizzle')
  const sql = postgres({ host: c.host, port: c.port, database: c.database, username: c.username, password: c.password, max: 1, connect_timeout: 15, onnotice: () => {} })
  const inicio = Date.now()
  try {
    await sql`select pg_advisory_lock(${TRAVA})`
    const antes = await aplicadas(sql)
    await migrate(drizzle({ client: sql }), { migrationsFolder: pasta, migrationsTable: 'migracoes', migrationsSchema: 'public' })
    const depois = await aplicadas(sql)
    console.log(`migrações em dia: ${depois} aplicadas (${depois - antes} novas) em ${Date.now() - inicio} ms -- ${c.host}/${c.database}`)
  } finally {
    await sql.end()
  }
}

async function aplicadas(sql: postgres.Sql): Promise<number> {
  const [{ existe }] = await sql`select to_regclass('public.migracoes') is not null as existe`
  if (!existe) return 0
  const [{ n }] = await sql`select count(*)::int as n from public.migracoes`
  return n
}

main().catch((erro) => {
  console.error('migração falhou:', erro instanceof Error ? erro.message : erro)
  process.exit(1)
})
