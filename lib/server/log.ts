import 'server-only'
import pino from 'pino'

/**
 * Log estruturado (JSON por linha no stdout -- o Docker recolhe e rotaciona).
 *
 * Nunca registrar corpo de requisicao, senha, arquivo ou CPF/CNPJ: o log nao
 * tem o controle de acesso que o banco tem.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { app: 'contratos-juridicos' },
  timestamp: pino.stdTimeFunctions.isoTime,
})
