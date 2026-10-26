import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { contratos } from './contratos'

/**
 * Tarefas do quadro (docs/TASKS_IMPLEMENTATION_PLAN.md §3).
 *
 * Uso geral: a tarefa pode ficar avulsa ou apontar para um contrato. A coluna
 * do quadro E a situacao dela; `colunaDesde` diz quando entrou na atual (o
 * quadro mostra as concluidas mais recentes primeiro).
 *
 * Excluir e logico, como nos documentos: a linha fica, com quem excluiu e a
 * justificativa, e sai do quadro.
 */

export const colunaTarefa = pgEnum('coluna_tarefa', ['A fazer', 'Em andamento', 'Concluída'])

const instante = () => timestamp({ withTimezone: true, mode: 'string' })

export const tarefas = pgTable(
  'tarefas',
  {
    id: uuid().primaryKey().defaultRandom(),
    titulo: text().notNull(),
    descricao: text(),
    /** Texto livre (nome ou area), como o responsavel da obrigacao. */
    responsavel: text(),
    prazo: date({ mode: 'string' }),
    coluna: colunaTarefa().notNull(),
    colunaDesde: instante().notNull().defaultNow(),
    contratoId: uuid().references(() => contratos.id, { onDelete: 'restrict' }),
    /** Trava otimista da edicao (fase 2). */
    versao: integer().notNull().default(1),
    criadoPorMatricula: text().notNull(),
    criadoPorNome: text().notNull(),
    criadoEm: instante().notNull().defaultNow(),
    removidaEm: instante(),
    removidaPorMatricula: text(),
    removidaPorNome: text(),
    motivoRemocao: text(),
  },
  (t) => [
    check('tarefas_removida_completa', sql`(${t.removidaEm} is null) = (${t.motivoRemocao} is null)`),
    check('tarefas_titulo', sql`length(${t.titulo}) between 1 and 200`),
    index('tarefas_ativas_coluna')
      .on(t.coluna, t.criadoEm)
      .where(sql`${t.removidaEm} is null`),
    index('tarefas_contrato').on(t.contratoId),
  ],
)
