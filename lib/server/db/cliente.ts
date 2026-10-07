import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { configBanco } from '../config'
import * as esquema from './esquema'

/**
 * Conexao com o PostgreSQL (servidor corporativo; banco proprio deste app).
 *
 * Uma pool por processo, guardada em `globalThis` para o hot reload do
 * `next dev` nao abrir uma pool nova a cada edicao. O servidor e
 * compartilhado com outros sistemas: a pool e pequena de proposito.
 *
 * Colunas em camelCase no TypeScript viram snake_case no banco
 * (`casing: 'snake_case'`, igual ao drizzle.config.ts).
 */

const MAX_CONEXOES = 10

function criar() {
  const c = configBanco()
  const cliente = postgres({
    host: c.host,
    port: c.port,
    database: c.database,
    username: c.username,
    password: c.password,
    max: MAX_CONEXOES,
    idle_timeout: 30,
    connect_timeout: 10,
    // Avisos do servidor (ex.: "extensão já existe") nao sao erro; nao poluir o log.
    onnotice: () => {},
  })
  return { cliente, db: drizzle({ client: cliente, schema: esquema, casing: 'snake_case' }) }
}

type Conexao = ReturnType<typeof criar>
const CHAVE = Symbol.for('contratos-juridicos.banco')
const g = globalThis as unknown as Record<symbol, Conexao | undefined>

function conexao(): Conexao {
  return (g[CHAVE] ??= criar())
}

/**
 * Drizzle, para consultas tipadas. Preguicoso: a conexao so abre no primeiro
 * uso, entao importar este modulo (ex.: durante o `next build`) nao exige .env.
 */
export const db = new Proxy({} as Conexao['db'], {
  get: (_alvo, prop) => {
    const real = conexao().db
    const valor = Reflect.get(real, prop)
    return typeof valor === 'function' ? valor.bind(real) : valor
  },
})

/** Cliente postgres.js cru, para SQL que o Drizzle nao expressa bem. */
export function sqlCru() {
  return conexao().cliente
}

/** Transacao ou o proprio `db` -- funcoes de servico aceitam qualquer um dos dois. */
export type Executor = Conexao['db'] | Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

export async function fecharBanco() {
  const atual = g[CHAVE]
  if (!atual) return
  g[CHAVE] = undefined
  await atual.cliente.end({ timeout: 5 })
}
