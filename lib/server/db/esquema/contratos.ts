import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { documentos } from './documentos'
import { opcoesCadastro } from './opcoes'

/**
 * Contratos e o historico de vigencias (docs/BACKEND_IMPLEMENTATION.md §6.3–6.4).
 *
 * - Datas de calendario como `date` em texto (`AAAA-MM-DD`), dinheiro como
 *   `numeric(14,2)` em texto -- nada passa por float nem por fuso.
 * - `dataFim` e `valorMensal` sao os ATUAIS: mantidos pelo servico a partir
 *   da ultima vigencia valida (original/aditivos), nunca editados direto.
 * - Pessoas do contrato sao texto digitado (D6); quem fez algo e carimbo
 *   (matricula + nome), sem chave estrangeira.
 */

export const indiceReajuste = pgEnum('indice_reajuste', ['IPCA', 'IGP-M', 'INPC', 'Fixo', 'Outro'])
export const acaoVencimento = pgEnum('acao_vencimento', ['Renovar', 'Renegociar', 'Encerrar', 'Em análise'])
export const statusAcao = pgEnum('status_acao', ['Pendente', 'Em andamento', 'Concluída'])
export const motivoEncerramento = pgEnum('motivo_encerramento', ['manual', 'renovado'])
export const tipoVigencia = pgEnum('tipo_vigencia', ['Original', 'Aditivo', 'Renovação'])

/** Numero global do codigo CTR-AAAA-NNNNNN: nunca reinicia, nunca e reaproveitado. */
export const contratoCodigoSeq = pgSequence('contrato_codigo_seq', { startWith: 1 })

const dinheiro = (precisao = 14) => numeric({ precision: precisao, scale: 2 })
const dataTexto = () => date({ mode: 'string' })
const instante = () => timestamp({ withTimezone: true, mode: 'string' })
const opcao = () =>
  uuid()
    .notNull()
    .references(() => opcoesCadastro.id, { onDelete: 'restrict' })

export const contratos = pgTable(
  'contratos',
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: text().notNull().unique(),
    nome: text().notNull(),

    categoriaId: opcao(),
    segmentoId: opcao(),
    empresaId: opcao(),
    filialId: opcao(),
    areaResponsavelId: opcao(),
    centroCustoId: opcao(),

    fornecedorNome: text().notNull(),
    /** Sem pontuacao, maiusculas (CNPJ alfanumerico). */
    fornecedorDocumento: text().notNull(),
    fornecedorContato: text(),
    objeto: text().notNull(),
    observacoes: text(),

    gestorNome: text().notNull(),
    /** Minusculas, aparado: define quem ve contrato restrito e quem recebe alerta. */
    gestorEmail: text().notNull(),
    responsavelJuridicoNome: text().notNull(),
    responsavelJuridicoEmail: text().notNull(),
    acessoRestrito: boolean().notNull().default(false),

    dataInicio: dataTexto().notNull(),
    dataFim: dataTexto().notNull(),
    renovacaoAutomatica: boolean().notNull(),
    prazoAvisoCancelamentoDias: integer().notNull(),

    valorMensal: dinheiro().notNull(),
    formaPagamento: text().notNull(),
    indiceReajuste: indiceReajuste().notNull(),
    dataBaseReajuste: dataTexto().notNull(),
    multaRescisao: dinheiro(),

    acaoVencimento: acaoVencimento(),
    responsavelAcao: text(),
    prazoAcao: dataTexto(),
    statusAcao: statusAcao(),

    encerradoEm: dataTexto(),
    motivoEncerramento: motivoEncerramento(),
    justificativaEncerramento: text(),
    encerradoPorMatricula: text(),
    encerradoPorNome: text(),
    renovaContratoId: uuid().references((): AnyPgColumn => contratos.id, { onDelete: 'restrict' }),
    renovadoPorContratoId: uuid().references((): AnyPgColumn => contratos.id, { onDelete: 'restrict' }),

    criadoPorMatricula: text().notNull(),
    criadoPorNome: text().notNull(),
    criadoEm: instante().notNull().defaultNow(),
    atualizadoEm: instante().notNull().defaultNow(),
    versao: integer().notNull().default(1),
  },
  (t) => [
    check('contratos_vigencia_ordenada', sql`${t.dataFim} >= ${t.dataInicio}`),
    check('contratos_prazo_aviso', sql`${t.prazoAvisoCancelamentoDias} between 0 and 3650`),
    check('contratos_valores_positivos', sql`${t.valorMensal} >= 0 and (${t.multaRescisao} is null or ${t.multaRescisao} >= 0)`),
    check(
      'contratos_encerramento_completo',
      sql`(${t.encerradoEm} is null) = (${t.motivoEncerramento} is null)`,
    ),
    check(
      'contratos_renovado_tem_sucessor',
      sql`(${t.motivoEncerramento} = 'renovado') = (${t.renovadoPorContratoId} is not null)`,
    ),
    check(
      'contratos_acao_completa',
      sql`${t.acaoVencimento} is null or (${t.responsavelAcao} is not null and ${t.prazoAcao} is not null and ${t.statusAcao} is not null)`,
    ),
    index('contratos_data_fim').on(t.dataFim),
    index('contratos_gestor_email').on(t.gestorEmail),
    index('contratos_juridico_email').on(t.responsavelJuridicoEmail),
    index('contratos_fornecedor_documento').on(t.fornecedorDocumento),
  ],
)

export const contratoVigencias = pgTable(
  'contrato_vigencias',
  {
    id: uuid().primaryKey().defaultRandom(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id, { onDelete: 'restrict' }),
    tipo: tipoVigencia().notNull(),
    /** Numero do aditivo no contrato (1, 2, ...); nunca reaproveitado, nem quando anulado. */
    numero: integer(),
    dataInicio: dataTexto().notNull(),
    dataFim: dataTexto().notNull(),
    valorMensal: dinheiro().notNull(),
    observacao: text(),
    /** O aditivo assinado, quando enviado. */
    documentoId: uuid().references((): AnyPgColumn => documentos.id, { onDelete: 'restrict' }),
    anuladoEm: instante(),
    anuladoPorMatricula: text(),
    anuladoPorNome: text(),
    justificativaAnulacao: text(),
    criadoPorMatricula: text().notNull(),
    criadoPorNome: text().notNull(),
    criadoEm: instante().notNull().defaultNow(),
  },
  (t) => [
    check('vigencias_ordenada', sql`${t.dataFim} >= ${t.dataInicio}`),
    check('vigencias_so_aditivo_anula', sql`${t.anuladoEm} is null or ${t.tipo} = 'Aditivo'`),
    index('vigencias_contrato').on(t.contratoId, t.criadoEm),
  ],
)
