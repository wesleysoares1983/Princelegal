import { z } from 'zod'

/**
 * Variaveis de ambiente do servidor, validadas com zod.
 *
 * Cada grupo e lido sob demanda (e guardado depois da primeira leitura): o
 * `next build` roda sem .env, e o proxy so precisa do grupo de sessao. No
 * boot do servidor, `validarAmbiente()` (instrumentation.ts) confere tudo de
 * uma vez e derruba o processo com a lista do que falta -- melhor do que
 * descobrir na primeira requisicao que usar a variavel.
 *
 * Sem `import 'server-only'` de proposito: este modulo tambem roda no proxy.
 */

const texto = (nome: string) => z.string({ error: `defina ${nome}` }).trim().min(1, `defina ${nome}`)

const esquemaAppsPrincesa = z.object({
  APPS_PRINCESA_URL: texto('APPS_PRINCESA_URL').pipe(z.url('APPS_PRINCESA_URL deve ser uma URL')),
  APPS_INTERNAL_KEY: texto('APPS_INTERNAL_KEY'),
  APP_ID: z.coerce.number({ error: 'APP_ID deve ser um número' }).int().positive('APP_ID deve ser um inteiro positivo'),
})

const esquemaSessao = z.object({
  SESSION_SECRET: texto('SESSION_SECRET').pipe(z.string().min(32, 'SESSION_SECRET precisa de pelo menos 32 caracteres')),
})

const esquemaBanco = z.object({
  POSTGRES_HOST: texto('POSTGRES_HOST'),
  POSTGRES_PORT: z.coerce.number({ error: 'POSTGRES_PORT deve ser um número' }).int().positive().default(5432),
  POSTGRES_DATABASE: texto('POSTGRES_DATABASE'),
  POSTGRES_USERNAME: texto('POSTGRES_USERNAME'),
  POSTGRES_PASSWORD: texto('POSTGRES_PASSWORD'),
})

function ler<T extends z.ZodType>(esquema: T): z.infer<T> {
  const resultado = esquema.safeParse(process.env)
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => i.message).join('; ')
    throw new Error(`Configuração inválida no .env: ${problemas}`)
  }
  return resultado.data
}

function memorizar<T>(fn: () => T): () => T {
  let valor: { v: T } | null = null
  return () => (valor ??= { v: fn() }).v
}

export interface ConfigAppsPrincesa {
  /** URL base dos Apps Princesa, sem barra no final. */
  url: string
  chaveInterna: string
  appId: number
}

export const configAppsPrincesa = memorizar((): ConfigAppsPrincesa => {
  const e = ler(esquemaAppsPrincesa)
  return { url: e.APPS_PRINCESA_URL.replace(/\/+$/, ''), chaveInterna: e.APPS_INTERNAL_KEY, appId: e.APP_ID }
})

/** Segredo que assina o cookie de sessao. */
export const segredoSessao = memorizar(() => ler(esquemaSessao).SESSION_SECRET)

export interface ConfigBanco {
  host: string
  port: number
  database: string
  username: string
  password: string
}

export const configBanco = memorizar((): ConfigBanco => {
  const e = ler(esquemaBanco)
  return {
    host: e.POSTGRES_HOST,
    port: e.POSTGRES_PORT,
    database: e.POSTGRES_DATABASE,
    username: e.POSTGRES_USERNAME,
    password: e.POSTGRES_PASSWORD,
  }
})

const emProducao = () => process.env.NODE_ENV === 'production'

const esquemaArmazenamento = z.object({
  // Em producao e obrigatorio (o volume do Docker); fora dela, uma pasta local ignorada pelo git.
  ARMAZENAMENTO_DIR: z
    .string()
    .trim()
    .optional()
    .refine((v) => !emProducao() || !!v, 'defina ARMAZENAMENTO_DIR (pasta dos arquivos enviados; o volume do Docker em produção)'),
  UPLOAD_MAX_MB: z.coerce.number({ error: 'UPLOAD_MAX_MB deve ser um número' }).positive().max(200).default(25),
})

export interface ConfigArmazenamento {
  /** Pasta raiz dos arquivos (absoluta ou relativa ao diretorio do processo). */
  diretorio: string
  maxBytes: number
}

export const configArmazenamento = memorizar((): ConfigArmazenamento => {
  const e = ler(esquemaArmazenamento)
  return { diretorio: e.ARMAZENAMENTO_DIR || '.dados/arquivos', maxBytes: e.UPLOAD_MAX_MB * 1024 * 1024 }
})

/** Confere todas as variaveis de uma vez; lanca com a lista completa do que esta errado. */
export function validarAmbiente() {
  const resultado = esquemaAppsPrincesa.and(esquemaSessao).and(esquemaBanco).and(esquemaArmazenamento).safeParse(process.env)
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.message}`).join('\n')
    throw new Error(`Configuração inválida no .env:\n${problemas}`)
  }
}
