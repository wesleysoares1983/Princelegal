import { sql } from 'drizzle-orm'
import { type AnyPgColumn, check, date, index, pgEnum, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { contratos } from './contratos'

/**
 * Obrigações do contrato (docs/BACKEND_IMPLEMENTATION.md §6.5).
 *
 * Série recorrente = cadeia por `anteriorId`: cumprir uma ocorrência gera a
 * próxima (Mensal/Anual) enquanto couber na vigência.
 *
 * `origemCancelamento` diz POR QUE foi cancelada -- é o que permite, ao
 * reabrir um contrato, devolver a pendente exatamente as que o encerramento
 * cancelou, sem ressuscitar as que alguém cancelou à mão.
 */

export const recorrencia = pgEnum('recorrencia_obrigacao', ['Única', 'Mensal', 'Anual', 'Por evento'])
export const situacaoObrigacao = pgEnum('situacao_obrigacao', ['pendente', 'cumprida', 'cancelada'])
export const origemCancelamento = pgEnum('origem_cancelamento_obrigacao', ['manual', 'encerramento', 'renovacao', 'reducao_vigencia'])

const instante = () => timestamp({ withTimezone: true, mode: 'string' })
const dataTexto = () => date({ mode: 'string' })

export const obrigacoes = pgTable(
  'obrigacoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id, { onDelete: 'restrict' }),
    descricao: text().notNull(),
    /** Área ou pessoa, texto livre (decisão do M5). */
    responsavel: text().notNull(),
    data: dataTexto().notNull(),
    recorrencia: recorrencia().notNull(),
    /** Mensal/Anual: o dia original do mês (31 -> 28/29 -> 31). */
    diaAncora: smallint(),
    situacao: situacaoObrigacao().notNull().default('pendente'),
    cumpridaEm: dataTexto(),
    cumpridaPorMatricula: text(),
    cumpridaPorNome: text(),
    observacaoCumprimento: text(),
    canceladaEm: instante(),
    motivoCancelamento: text(),
    origemCancelamento: origemCancelamento(),
    /** A ocorrência que gerou esta (série recorrente). */
    anteriorId: uuid().references((): AnyPgColumn => obrigacoes.id, { onDelete: 'restrict' }),
    /** Alguém editou depois de criada -- "desfazer cumprida" não apaga ocorrência mexida. */
    editadaEm: instante(),
    /** Vazio = gerada pelo sistema. */
    criadoPorMatricula: text(),
    criadoPorNome: text(),
    criadoEm: instante().notNull().defaultNow(),
  },
  (t) => [
    check('obrigacoes_cumprida_completa', sql`(${t.situacao} = 'cumprida') = (${t.cumpridaEm} is not null)`),
    check('obrigacoes_cancelada_completa', sql`(${t.situacao} = 'cancelada') = (${t.canceladaEm} is not null)`),
    check('obrigacoes_ancora', sql`${t.diaAncora} is null or ${t.diaAncora} between 1 and 31`),
    index('obrigacoes_situacao_data').on(t.situacao, t.data),
    index('obrigacoes_contrato').on(t.contratoId),
    index('obrigacoes_anterior').on(t.anteriorId),
  ],
)
