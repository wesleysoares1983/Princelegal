import { z } from 'zod'
import { ehDataIso } from './datas'
import { normalizarDocumento, tipoDocumento } from './documentoFiscal'
import type { Avaliacao, Status } from './status'
import { STATUS } from './status'

/**
 * Contratos: o que cliente e servidor compartilham -- valores fixos, formato
 * das respostas e regras de validacao (docs/BACKEND_IMPLEMENTATION.md §8.3–8.5).
 */

export const INDICES_REAJUSTE = ['IPCA', 'IGP-M', 'INPC', 'Fixo', 'Outro'] as const
export type IndiceReajuste = (typeof INDICES_REAJUSTE)[number]

export const ACOES_VENCIMENTO = ['Renovar', 'Renegociar', 'Encerrar', 'Em análise'] as const
export type AcaoVencimento = (typeof ACOES_VENCIMENTO)[number]

export const STATUS_ACAO = ['Pendente', 'Em andamento', 'Concluída'] as const
export type StatusAcao = (typeof STATUS_ACAO)[number]

export const TIPOS_VIGENCIA = ['Original', 'Aditivo', 'Renovação'] as const
export type TipoVigencia = (typeof TIPOS_VIGENCIA)[number]

export const MOTIVOS_ENCERRAMENTO = ['manual', 'renovado'] as const
export type MotivoEncerramento = (typeof MOTIVOS_ENCERRAMENTO)[number]

// ---------------------------------------------------------------- respostas

/** Quem fez algo: matricula + nome naquele momento (carimbo, sem chave estrangeira). */
export interface Carimbo {
  matricula: string
  nome: string
}

export interface OpcaoRef {
  id: string
  valor: string
  /** Opcao desativada continua aparecendo nos contratos que ja a usam. */
  ativo: boolean
}

export interface ContratoResumo {
  id: string
  codigo: string
  nome: string
  categoria: string
  areaResponsavel: string
  fornecedorNome: string
  /** Formatado (CNPJ/CPF). */
  fornecedorDocumento: string
  gestorNome: string
  dataInicio: string
  dataFim: string
  valorMensal: number
  renovacaoAutomatica: boolean
  acessoRestrito: boolean
  avaliacao: Avaliacao
}

export interface Vigencia {
  id: string
  tipo: TipoVigencia
  /** Numero do aditivo (1, 2, ...); null no Original/Renovação. */
  numero: number | null
  dataInicio: string
  dataFim: string
  valorMensal: number
  observacao: string | null
  anulado: boolean
  /** Ultimo aditivo valido, para administrador, com contrato aberto. */
  anulavel: boolean
  justificativaAnulacao: string | null
  /** Arquivo assinado do aditivo/renovação, quando enviado. */
  documento: { id: string; nome: string; removido: boolean } | null
  criadoPor: Carimbo
  criadoEm: string
}

export interface PermissoesContrato {
  editar: boolean
  alterarRestricao: boolean
  encerrar: boolean
  reabrir: boolean
  registrarAditivo: boolean
  renovar: boolean
}

export interface ContratoDetalhe {
  id: string
  codigo: string
  versao: number
  nome: string
  categoria: OpcaoRef
  segmento: OpcaoRef
  empresa: OpcaoRef
  filial: OpcaoRef
  areaResponsavel: OpcaoRef
  centroCusto: OpcaoRef
  fornecedorNome: string
  fornecedorDocumento: string
  fornecedorContato: string | null
  objeto: string
  observacoes: string | null
  gestorNome: string
  gestorEmail: string
  responsavelJuridicoNome: string
  responsavelJuridicoEmail: string
  acessoRestrito: boolean
  dataInicio: string
  dataFim: string
  dataLimiteAviso: string
  renovacaoAutomatica: boolean
  prazoAvisoCancelamentoDias: number
  valorMensal: number
  valorAnual: number
  formaPagamento: string
  indiceReajuste: IndiceReajuste
  dataBaseReajuste: string
  proximoReajuste: string
  multaRescisao: number | null
  acaoVencimento: { acao: AcaoVencimento; responsavel: string; prazo: string; status: StatusAcao } | null
  encerramento: { data: string; motivo: MotivoEncerramento; justificativa: string | null; por: Carimbo | null } | null
  renova: { id: string; codigo: string } | null
  renovadoPor: { id: string; codigo: string } | null
  avaliacao: Avaliacao
  historico: Vigencia[]
  permissoes: PermissoesContrato
  criadoPor: Carimbo
  criadoEm: string
  atualizadoEm: string
}

export interface EventoAuditoria {
  id: number
  ocorridoEm: string
  /** null = Sistema. */
  usuario: Carimbo | null
  contrato: { id: string; codigo: string; nome: string } | null
  categoria: string
  acao: string
  descricao: string
  dados: unknown
}

export interface Paginado<T> {
  itens: T[]
  total: number
  pagina: number
  porPagina: number
}

export interface Painel {
  contagens: {
    ativos: number
    vence90: number
    vence30: number
    vencidos: number
    renovacaoAutomatica: number
    decisaoUrgente: number
  }
  /** Soma de valorMensal × 12 dos contratos ativos visiveis. */
  valorAnualAtivos: number
  /** Contratos ativos com prazo de decisao a 30 dias ou menos (o quadro de aviso do Inicio). */
  decisoesUrgentes: ContratoResumo[]
  proximosVencimentos: ContratoResumo[]
}

// ---------------------------------------------------------------- validacao

const texto = (min: number, max: number, rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(min, min <= 1 ? `Informe ${rotulo}.` : `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: no mínimo ${min} caracteres.`)
    .max(max, `Use no máximo ${max} caracteres.`)

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null))

const data = (rotulo: string) =>
  z.string({ error: `Informe ${rotulo}.` }).refine(ehDataIso, `Informe ${rotulo} válida (AAAA-MM-DD).`)

const dinheiro = (rotulo: string) =>
  z
    .number({ error: `Informe ${rotulo}.` })
    .nonnegative(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} não pode ser negativo.`)
    .max(999_999_999_999.99, 'Valor alto demais.')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Use no máximo 2 casas decimais.')

const email = (rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .toLowerCase()
    .pipe(z.email(`Informe ${rotulo} válido.`).max(200))

const idOpcao = (rotulo: string) => z.uuid(`Selecione ${rotulo}.`)

const documento = z
  .string({ error: 'Informe o CNPJ ou CPF.' })
  .refine((v) => tipoDocumento(v) !== null, 'CNPJ ou CPF inválido (confira os dígitos verificadores).')
  .transform(normalizarDocumento)

/** Campos que a criacao aceita (sem a vigencia/valor, que vem a parte). */
const camposEditaveis = {
  nome: texto(3, 200, 'o nome do contrato'),
  categoriaId: idOpcao('a categoria'),
  segmentoId: idOpcao('o segmento'),
  empresaId: idOpcao('a empresa'),
  filialId: idOpcao('a filial'),
  areaResponsavelId: idOpcao('a área responsável'),
  centroCustoId: idOpcao('o centro de custo'),
  fornecedorNome: texto(2, 200, 'a razão social'),
  fornecedorDocumento: documento,
  fornecedorContato: textoOpcional(200),
  objeto: texto(3, 2000, 'o objeto do contrato'),
  observacoes: textoOpcional(4000),
  gestorNome: texto(2, 120, 'o nome do gestor'),
  gestorEmail: email('o e-mail do gestor'),
  responsavelJuridicoNome: texto(2, 120, 'o nome do responsável jurídico'),
  responsavelJuridicoEmail: email('o e-mail do responsável jurídico'),
  acessoRestrito: z.boolean().default(false),
  renovacaoAutomatica: z.boolean({ error: 'Informe se a renovação é automática.' }),
  prazoAvisoCancelamentoDias: z
    .number({ error: 'Informe o prazo de aviso.' })
    .int('Use dias inteiros.')
    .min(0, 'O prazo de aviso não pode ser negativo.')
    .max(3650, 'Prazo de aviso de no máximo 3650 dias.'),
  formaPagamento: texto(2, 100, 'a forma de pagamento'),
  indiceReajuste: z.enum(INDICES_REAJUSTE, { error: 'Selecione o índice de reajuste.' }),
  dataBaseReajuste: data('a data-base de reajuste'),
  multaRescisao: dinheiro('a multa de rescisão').nullish().transform((v) => v ?? null),
}

export const esquemaCriarContrato = z
  .object({
    ...camposEditaveis,
    dataInicio: data('a data de início'),
    dataFim: data('a data de término'),
    valorMensal: dinheiro('o valor mensal'),
    /** Confirma o cadastro mesmo com contrato parecido ja existente (409 POSSIVEL_DUPLICIDADE). */
    confirmarDuplicidade: z.boolean().optional(),
  })
  .refine((d) => d.dataFim >= d.dataInicio, { error: 'O término deve ser igual ou posterior ao início.', path: ['dataFim'] })
export type DadosCriarContrato = z.infer<typeof esquemaCriarContrato>

/** Vigencia e valor so mudam por aditivo (D9); codigo e encerramento tem rotas proprias. */
export const CAMPOS_FORA_DA_EDICAO = ['dataInicio', 'dataFim', 'valorMensal', 'codigo', 'encerradoEm', 'motivoEncerramento'] as const

export const esquemaEditarContrato = z
  .object({
    versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
    ...Object.fromEntries(Object.entries(camposEditaveis).map(([k, v]) => [k, v.optional()])),
    acessoRestrito: z.boolean().optional(),
    acaoVencimento: z.enum(ACOES_VENCIMENTO, { error: 'Ação de vencimento inválida.' }).nullable().optional(),
    responsavelAcao: textoOpcional(120).optional(),
    prazoAcao: data('o prazo da ação').nullable().optional(),
    statusAcao: z.enum(STATUS_ACAO, { error: 'Status da ação inválido.' }).nullable().optional(),
  })
  .strict()
export type DadosEditarContrato = {
  versao: number
} & Partial<Omit<z.output<typeof esquemaCriarContrato>, 'dataInicio' | 'dataFim' | 'valorMensal' | 'confirmarDuplicidade'>> & {
    acaoVencimento?: AcaoVencimento | null
    responsavelAcao?: string | null
    prazoAcao?: string | null
    statusAcao?: StatusAcao | null
  }

/** Aditivo: novo periodo e/ou novo valor mensal. Vigencia e valor so mudam por aqui (D9). */
export const esquemaAditivo = z
  .object({
    versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
    dataInicio: data('o início do aditivo'),
    dataFim: data('o término do aditivo'),
    valorMensal: dinheiro('o valor mensal'),
    observacao: textoOpcional(1000),
    /** Confirma um aditivo que deixa o contrato vencido na hora (encurtamento). */
    confirmarEncurtamento: z.boolean().optional(),
  })
  .refine((d) => d.dataFim >= d.dataInicio, { error: 'O término deve ser igual ou posterior ao início.', path: ['dataFim'] })
export type DadosAditivo = Omit<z.infer<typeof esquemaAditivo>, 'observacao'> & { observacao?: string | null }

export const esquemaAnularAditivo = z.object({
  versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
  justificativa: texto(5, 1000, 'a justificativa'),
})
export type DadosAnularAditivo = z.infer<typeof esquemaAnularAditivo>

/**
 * Renovacao: novo periodo e valor (obrigatorios) + qualquer campo do cadastro
 * para mudar no contrato novo; o que nao vier e copiado do antigo.
 */
export const esquemaRenovar = z
  .object({
    versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
    dataInicio: data('o início da renovação'),
    dataFim: data('o término da renovação'),
    valorMensal: dinheiro('o valor mensal'),
    ...Object.fromEntries(Object.entries(camposEditaveis).map(([k, v]) => [k, v.optional()])),
    acessoRestrito: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.dataFim >= d.dataInicio, { error: 'O término deve ser igual ou posterior ao início.', path: ['dataFim'] })
export type DadosRenovar = { versao: number; dataInicio: string; dataFim: string; valorMensal: number } & Partial<
  Omit<z.output<typeof esquemaCriarContrato>, 'dataInicio' | 'dataFim' | 'valorMensal' | 'confirmarDuplicidade'>
>

export const esquemaEncerrar = z.object({
  versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
  data: data('a data de encerramento').optional(),
  justificativa: texto(5, 1000, 'a justificativa'),
})
export type DadosEncerrar = z.infer<typeof esquemaEncerrar>

export const esquemaReabrir = z.object({
  versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
  justificativa: texto(5, 1000, 'a justificativa'),
})
export type DadosReabrir = z.infer<typeof esquemaReabrir>

const pagina = {
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
}

export const FILTROS_STATUS = ['todos', 'ativos', ...STATUS] as const
export type FiltroStatus = (typeof FILTROS_STATUS)[number]

export const esquemaListarContratos = z.object({
  status: z.enum(FILTROS_STATUS, { error: 'Status inválido.' }).default('todos'),
  renovacaoAutomatica: z.enum(['sim']).optional(),
  busca: z.string().trim().max(200).optional(),
  categoriaId: z.uuid().optional(),
  segmentoId: z.uuid().optional(),
  empresaId: z.uuid().optional(),
  filialId: z.uuid().optional(),
  areaResponsavelId: z.uuid().optional(),
  centroCustoId: z.uuid().optional(),
  envolvido: z.enum(['eu']).optional(),
  ordenar: z.enum(['vencimento', 'nome', 'codigo', 'valor', '-valor']).default('vencimento'),
  ...pagina,
})
export type FiltroContratos = z.infer<typeof esquemaListarContratos>

export const CATEGORIAS_AUDITORIA = ['contrato', 'documento', 'obrigacao', 'acesso', 'configuracao', 'exportacao', 'sistema'] as const

export const esquemaListarAuditoria = z.object({
  busca: z.string().trim().max(200).optional(),
  /** Matricula, ou `sistema` para eventos sem usuario. */
  usuario: z.string().trim().max(50).optional(),
  contratoId: z.uuid().optional(),
  categoria: z.enum(CATEGORIAS_AUDITORIA).optional(),
  de: data('a data inicial').optional(),
  ate: data('a data final').optional(),
  incluirAcessos: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  ...pagina,
})
export type FiltroAuditoria = z.infer<typeof esquemaListarAuditoria>

export type { Avaliacao, Status }
