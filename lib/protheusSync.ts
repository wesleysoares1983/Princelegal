import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import type { ContratoProtheus } from './contratosProtheus'

/**
 * Sincronização com o endpoint de contratos do Protheus.
 *
 * O endpoint não é consultado a cada acesso da tela: `sincronizarContratosProtheus`
 * roda uma vez por dia (agendada em instrumentation.ts) e grava o resultado num
 * arquivo local. A tela e a rota /api/protheus/contracts só leem esse arquivo,
 * então ficam no ar mesmo se o Protheus estiver fora nesse momento.
 */

const CACHE_PATH = path.join(process.cwd(), 'data', 'contratos-protheus.json')

export interface CacheContratosProtheus {
  atualizadoEm: string // ISO datetime
  contratos: ContratoProtheus[]
  erro?: string
}

/** O Protheus manda datas como "AAAAMMDD" (string, sem separador). */
function dataProtheusParaIso(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length !== 8) return ''
  return `${valor.slice(0, 4)}-${valor.slice(4, 6)}-${valor.slice(6, 8)}`
}

function numeroOuZero(valor: unknown): number {
  return typeof valor === 'number' ? valor : 0
}

function textoOuVazio(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

/** Payload real: `{ data: { contracts: [ { NUMERO, CLIENTE, CONTRATO, ... } ] } }`. */
function mapearContrato(item: Record<string, unknown>): ContratoProtheus {
  return {
    numero: textoOuVazio(item.NUMERO),
    cliente: textoOuVazio(item.CLIENTE),
    tipoContrato: textoOuVazio(item.CONTRATO),
    empresa: textoOuVazio(item.EMPRESA),
    filial: textoOuVazio(item.FILIAL),
    dataAssinatura: dataProtheusParaIso(item.DATA_ASSINATURA),
    dataInicio: dataProtheusParaIso(item.DATA_INICIO),
    dataFim: dataProtheusParaIso(item.DATA_FIM),
    reajuste: textoOuVazio(item.REAJUSTE),
    situacao: textoOuVazio(item.SITUACAO) || 'Não informado',
    valorAtual: numeroOuZero(item.VALOR_ATUAL),
    valorInicial: numeroOuZero(item.VALOR_INI),
    valorSaldo: numeroOuZero(item.VALOR_SALDO),
  }
}

function extrairLista(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const objeto = payload as Record<string, unknown>
    const dados = objeto.data && typeof objeto.data === 'object' ? (objeto.data as Record<string, unknown>) : objeto
    for (const chave of ['contracts', 'items', 'contratos']) {
      const valor = dados[chave]
      if (Array.isArray(valor)) return valor as Record<string, unknown>[]
    }
  }
  return []
}

export async function sincronizarContratosProtheus(): Promise<CacheContratosProtheus> {
  const url = process.env.PROTHEUS_CONTRACTS_URL
  const token = process.env.PROTHEUS_CONTRACTS_TOKEN

  if (!url || !token) {
    const cache: CacheContratosProtheus = {
      atualizadoEm: new Date().toISOString(),
      contratos: [],
      erro: 'PROTHEUS_CONTRACTS_URL ou PROTHEUS_CONTRACTS_TOKEN não configurados (.env.local).',
    }
    await gravarCache(cache)
    return cache
  }

  try {
    const resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!resposta.ok) {
      throw new Error(`Endpoint do Protheus respondeu ${resposta.status}`)
    }

    const payload = await resposta.json()
    const contratos = extrairLista(payload).map(mapearContrato)

    const cache: CacheContratosProtheus = { atualizadoEm: new Date().toISOString(), contratos }
    await gravarCache(cache)
    return cache
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha desconhecida ao sincronizar com o Protheus.'
    const anterior = await lerCacheContratosProtheus()
    const cache: CacheContratosProtheus = {
      atualizadoEm: new Date().toISOString(),
      contratos: anterior?.contratos ?? [],
      erro: mensagem,
    }
    await gravarCache(cache)
    return cache
  }
}

async function gravarCache(cache: CacheContratosProtheus): Promise<void> {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8')
}

export async function lerCacheContratosProtheus(): Promise<CacheContratosProtheus | null> {
  try {
    const conteudo = await readFile(CACHE_PATH, 'utf-8')
    return JSON.parse(conteudo) as CacheContratosProtheus
  } catch {
    return null
  }
}
