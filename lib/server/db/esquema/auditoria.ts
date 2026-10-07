import { bigserial, index, inet, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const categoriaAuditoria = pgEnum('categoria_auditoria', [
  'contrato',
  'documento',
  'obrigacao',
  'acesso',
  'configuracao',
  'exportacao',
  'sistema',
])

/**
 * Trilha de auditoria: so recebe INSERT.
 *
 * Um gatilho (migracao 0002) recusa UPDATE, DELETE e TRUNCATE. Quem fez fica
 * como "carimbo" (matricula + nome naquele momento), sem chave estrangeira:
 * os usuarios moram nos Apps Princesa, nao neste banco. Carimbo vazio = Sistema.
 */
export const auditoria = pgTable(
  'auditoria',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    ocorridoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    usuarioMatricula: text(),
    usuarioNome: text(),
    // Vira chave estrangeira para `contratos` quando a tabela existir (M2).
    contratoId: uuid(),
    categoria: categoriaAuditoria().notNull(),
    /** Codigo de maquina, ex.: `contrato.criado`. */
    acao: text().notNull(),
    /** Frase que a tela mostra, ex.: "Anexou Aditivo 01". */
    descricao: text().notNull(),
    dados: jsonb(),
    ip: inet(),
    userAgent: text(),
  },
  (t) => [
    index('auditoria_contrato_ocorrido').on(t.contratoId, t.ocorridoEm.desc()),
    index('auditoria_ocorrido').on(t.ocorridoEm.desc()),
    index('auditoria_usuario').on(t.usuarioMatricula),
  ],
)
