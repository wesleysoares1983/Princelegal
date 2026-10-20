/**
 * Contratos vindos do Protheus (TOTVS).
 *
 * O navegador nunca chama o Protheus direto (o token ficaria exposto): esta
 * função busca em `/api/protheus/contracts`, uma rota interna que só lê o
 * cache atualizado 1x por dia pela sincronização em lib/protheusSync.ts.
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

export interface RespostaContratosProtheus {
  atualizadoEm: string // ISO datetime
  contratos: ContratoProtheus[]
  erro?: string
}

export async function listarContratosProtheus(): Promise<RespostaContratosProtheus> {
  const resposta = await fetch('/api/protheus/contracts')
  if (!resposta.ok) {
    throw new Error(`Falha ao consultar contratos do Protheus (HTTP ${resposta.status}).`)
  }
  return resposta.json()
}
