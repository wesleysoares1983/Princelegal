import { defineConfig } from 'drizzle-kit'

/**
 * drizzle-kit: `npm run db:gerar` cria a migracao SQL a partir do esquema
 * (lib/server/db/esquema); `npm run db:migrar` aplica no banco do .env.
 * As migracoes geradas sao revisadas e commitadas em drizzle/.
 */
try {
  process.loadEnvFile('.env')
} catch {
  // Sem .env (ex.: CI): as variaveis ja vem do ambiente.
}

const e = process.env

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/db/esquema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    host: e.POSTGRES_HOST ?? '',
    port: Number(e.POSTGRES_PORT ?? 5432),
    database: e.POSTGRES_DATABASE ?? '',
    user: e.POSTGRES_USERNAME,
    password: e.POSTGRES_PASSWORD,
    ssl: false,
  },
  migrations: { table: 'migracoes', schema: 'public' },
})
