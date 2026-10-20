/**
 * Contratos vindos do Protheus (TOTVS): somente leitura, sem vinculo com os
 * contratos cadastrados aqui.
 *
 * O navegador nunca chama o Protheus direto (o token ficaria exposto): o
 * worker sincroniza 1x por dia num cache (lib/server/servicos/protheus.ts) e
 * a tela le esse cache por GET /api/v1/contratos-protheus.
 */

export interface ContratoProtheus {
  numero: string
  cliente: string
  tipoContrato: string
  empresa: string
  filial: string
  dataAssinatura: string // ISO
  dataInicio: string // ISO
  dataFim: string // ISO
  reajuste: string
  situacao: string
  valorAtual: number
  valorInicial: number
  valorSaldo: number
}

export interface ContratosProtheus {
  /** ISO datetime da ultima tentativa de sincronizacao; null = nenhuma ainda. */
  atualizadoEm: string | null
  /** Em falha, os da ultima sincronizacao que deu certo. */
  contratos: ContratoProtheus[]
  /** Motivo da falha da ultima tentativa. */
  erro?: string
}
