import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { contratos } from './contratos'

/**
 * Documentos do contrato (docs/BACKEND_IMPLEMENTATION.md §6.6).
 *
 * `documentos` e o documento logico (a linha da aba Documentos);
 * `documento_versoes` guarda cada arquivo enviado. Nada e apagado (D13):
 * "remover" marca `removidoEm`, e versoes antigas continuam baixaveis.
 */

export const tipoDocumento = pgEnum('tipo_documento', ['Contrato', 'Aditivo', 'Renovação', 'Anexo', 'Comprovante', 'Parecer jurídico'])

const instante = () => timestamp({ withTimezone: true, mode: 'string' })

export const documentos = pgTable(
  'documentos',
  {
    id: uuid().primaryKey().defaultRandom(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id, { onDelete: 'restrict' }),
    tipo: tipoDocumento().notNull(),
    nome: text().notNull(),
    versaoAtual: integer().notNull().default(1),
    removidoEm: instante(),
    removidoPorMatricula: text(),
    removidoPorNome: text(),
    motivoRemocao: text(),
    criadoEm: instante().notNull().defaultNow(),
  },
  (t) => [index('documentos_contrato').on(t.contratoId, t.criadoEm)],
)

export const documentoVersoes = pgTable(
  'documento_versoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    documentoId: uuid()
      .notNull()
      .references(() => documentos.id, { onDelete: 'restrict' }),
    versao: integer().notNull(),
    /** Nome original, saneado (so para exibir/baixar). */
    nomeArquivo: text().notNull(),
    /** Decidido pelo conteudo do arquivo, nao pelo navegador. */
    mime: text().notNull(),
    tamanhoBytes: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    /** `contratos/<contratoId>/<uuid>` -- gerada pelo servidor. */
    chaveArmazenamento: text().notNull().unique(),
    enviadoPorMatricula: text().notNull(),
    enviadoPorNome: text().notNull(),
    enviadoEm: instante().notNull().defaultNow(),
  },
  (t) => [
    unique('documento_versoes_numero').on(t.documentoId, t.versao),
    check('documento_versoes_tamanho', sql`${t.tamanhoBytes} > 0`),
  ],
)
