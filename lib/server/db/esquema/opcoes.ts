import { sql } from 'drizzle-orm'
import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/** Campos do formulario de contrato cujas opcoes o administrador mantem (Configurações › Opções de cadastro). */
export const campoOpcao = pgEnum('campo_opcao', [
  'categoria',
  'segmento',
  'empresa',
  'filial',
  'centro-custo',
  'area-responsavel',
])

/**
 * Opcoes de cadastro como linhas de tabela, nao texto copiado no contrato:
 * renomear vale para todos os contratos; "remover" e desativar (some dos
 * formularios novos, continua aparecendo nos contratos que ja a usam).
 */
export const opcoesCadastro = pgTable(
  'opcoes_cadastro',
  {
    id: uuid().primaryKey().defaultRandom(),
    campo: campoOpcao().notNull(),
    valor: text().notNull(),
    ativo: boolean().notNull().default(true),
    ordem: integer().notNull().default(0),
    versao: integer().notNull().default(1),
    criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "Água" e "agua" sao a mesma opcao -- inclusive contra uma inativa, que
    // entao e reativada em vez de duplicada. f_unaccent: ver migracao 0000.
    uniqueIndex('opcoes_cadastro_campo_valor_unico').on(t.campo, sql`lower(f_unaccent(${t.valor}))`),
  ],
)
