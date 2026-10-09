import { sql } from 'drizzle-orm'
import { date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { contratos } from './contratos'

/**
 * Alertas por e-mail já processados (docs/BACKEND_IMPLEMENTATION.md §6.8, §9.1).
 *
 * Uma linha por limiar de cada contrato. `dataReferencia` (o término, ou a
 * data-limite de aviso, no momento do envio) faz parte da chave: um aditivo
 * que muda o término recomeça o ciclo sem código extra.
 *
 * Único só entre `enviado`/`ignorado`: `falhou` pode repetir (cada dia uma
 * nova tentativa, até o limite do job).
 */

export const tipoAlerta = pgEnum('tipo_alerta', ['vencimento', 'prazo_aviso', 'vencido'])
export const situacaoAlerta = pgEnum('situacao_alerta', ['enviado', 'ignorado', 'falhou'])

export const alertasEnviados = pgTable(
  'alertas_enviados',
  {
    id: uuid().primaryKey().defaultRandom(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id, { onDelete: 'restrict' }),
    tipo: tipoAlerta().notNull(),
    /** 120/90/60/30/15/7; 0 para `vencido`. */
    limiarDias: integer().notNull(),
    dataReferencia: date({ mode: 'string' }).notNull(),
    situacao: situacaoAlerta().notNull(),
    destinatarios: text().array().notNull().default(sql`'{}'::text[]`),
    erro: text(),
    enviadoEm: timestamp({ withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('alertas_enviados_unico')
      .on(t.contratoId, t.tipo, t.limiarDias, t.dataReferencia)
      .where(sql`${t.situacao} in ('enviado', 'ignorado')`),
    index('alertas_enviados_contrato').on(t.contratoId, t.enviadoEm.desc()),
  ],
)
