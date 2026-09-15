/**
 * Modelo de dados do contrato.
 *
 * O cadastro nao e so identificacao: vigencia, financeiro, responsabilidade,
 * documentos, obrigacoes e alertas moram no mesmo registro porque sao
 * consultados juntos -- separar em telas estanques faz a pessoa abrir cinco
 * abas para saber se pode renovar um contrato.
 */

export type Categoria =
  | 'Aluguel'
  | 'Água'
  | 'Energia'
  | 'Condomínio'
  | 'Telecom'
  | 'Licença'
  | 'Seguro'
  | 'Prestação de Serviço'
  | 'Jurídico'
  | 'Outros'

export type IndiceReajuste = 'IPCA' | 'IGP-M' | 'INPC' | 'Fixo' | 'Outro'

export type AcaoVencimento = 'Renovar' | 'Renegociar' | 'Encerrar' | 'Em análise'

/**
 * Status calculado, nunca escolhido a mao.
 *
 * Guardar o status escrito no cadastro deixaria o dado errado no dia seguinte
 * ao vencimento, ate alguem abrir o contrato e lembrar de mudar. Calculado a
 * cada leitura, a tela de hoje sempre reflete a data de hoje.
 */
export type Status =
  | 'vigente'
  | 'atencao'
  | 'alerta'
  | 'vencido'
  | 'renovacao'
  | 'encerrado'
  | 'renovado'

export interface Obrigacao {
  id: string
  descricao: string
  responsavel: string
  data: string // ISO
  recorrencia: 'Única' | 'Mensal' | 'Anual' | 'Por evento'
  cumprida: boolean
}

export interface Documento {
  id: string
  nome: string
  tipo: 'Contrato' | 'Aditivo' | 'Renovação' | 'Anexo' | 'Comprovante' | 'Parecer jurídico'
  versao: number
  enviadoEm: string // ISO
  enviadoPor: string
}

export interface EventoAuditoria {
  id: string
  data: string // ISO
  usuario: string
  acao: string
}

export interface RegistroHistorico {
  id: string
  tipo: 'Original' | 'Aditivo' | 'Renovação'
  dataInicio: string
  dataFim: string
  valorMensal: number
  observacao?: string
}

export interface Contrato {
  id: string
  /** Identificador padrao: CTR-AAAA-NNNNNN. */
  codigo: string

  // Identificação
  nome: string
  categoria: Categoria
  fornecedorNome: string
  fornecedorDocumento: string
  fornecedorContato?: string
  objeto: string

  // Empresa / responsabilidade
  empresa: string
  filial: string
  areaResponsavel: string
  gestor: string
  responsavelJuridico: string
  acessoRestrito: boolean

  // Vigência
  dataInicio: string // ISO
  dataFim: string // ISO
  renovacaoAutomatica: boolean
  prazoAvisoCancelamentoDias: number

  // Financeiro
  valorMensal: number
  formaPagamento: string
  centroCusto: string
  indiceReajuste: IndiceReajuste
  dataBaseReajuste: string // ISO

  // Decisão / workflow
  acaoVencimento?: AcaoVencimento
  responsavelAcao?: string
  prazoAcao?: string // ISO
  statusAcao?: 'Em andamento' | 'Concluída' | 'Pendente'

  // Coleções
  obrigacoes: Obrigacao[]
  documentos: Documento[]
  historico: RegistroHistorico[]
  auditoria: EventoAuditoria[]

  encerradoEm?: string // ISO — presente só quando encerrado manualmente
}
