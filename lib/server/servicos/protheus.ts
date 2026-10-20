import 'server-only'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { ContratoProtheus, ContratosProtheus } from '@/lib/shared/contratosProtheus'
import { configProtheus } from '../config'

/**
 * Sincronização com o endpoint de contratos do Protheus.
 *
 * O endpoint não é consultado a cada acesso da tela: `sincronizarContratosProtheus`
 * roda uma vez por dia (agendada no worker, worker/index.ts) e grava o resultado num
 * arquivo local. A tela e GET /api/v1/contratos-protheus só leem esse arquivo,
 * então ficam no ar mesmo se o Protheus estiver fora nesse momento.
 */

/** No Docker o codigo e somente leitura; so /data aceita escrita (ver Dockerfile). */
const caminhoCache = () => resolve(configProtheus().pastaCache, 'contratos-protheus.json')

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

/**
 * Consulta o Protheus e grava o cache. Falha do Protheus não lança: vai para
 * `erro`, mantendo os contratos da última sincronização que deu certo. Só
 * lança se não conseguir gravar o cache.
 */
export async function sincronizarContratosProtheus(): Promise<ContratosProtheus> {
  const { conexao } = configProtheus()

  if (!conexao) {
    const cache: ContratosProtheus = {
      atualizadoEm: new Date().toISOString(),
      contratos: [],
      erro: 'Integração com o Protheus não configurada (defina PROTHEUS_CONTRACTS_TOKEN no .env).',
    }
    await gravarCache(cache)
    return cache
  }

  try {
    const resposta = await fetch(conexao.url, {
      headers: { Authorization: `Bearer ${conexao.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    })

    if (!resposta.ok) {
      throw new Error(`Endpoint do Protheus respondeu ${resposta.status}`)
    }

    const payload = await resposta.json()
    const contratos = extrairLista(payload).map(mapearContrato)

    const cache: ContratosProtheus = { atualizadoEm: new Date().toISOString(), contratos }
    await gravarCache(cache)
    return cache
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha desconhecida ao sincronizar com o Protheus.'
    const anterior = await lerCacheContratosProtheus()
    const cache: ContratosProtheus = {
      atualizadoEm: new Date().toISOString(),
      contratos: anterior?.contratos ?? [],
      erro: mensagem,
    }
    await gravarCache(cache)
    return cache
  }
}

/** Grava num temporario e troca com `rename` (atomico): quem le nunca pega o JSON pela metade. */
async function gravarCache(cache: ContratosProtheus): Promise<void> {
  const destino = caminhoCache()
  const temporario = `${destino}.tmp`
  await mkdir(dirname(destino), { recursive: true })
  await writeFile(temporario, JSON.stringify(cache, null, 2), 'utf-8')
  await rename(temporario, destino)
}

/** null = ainda não houve sincronização (ou o arquivo está ilegível). */
export async function lerCacheContratosProtheus(): Promise<ContratosProtheus | null> {
  try {
    const conteudo = await readFile(caminhoCache(), 'utf-8')
    return JSON.parse(conteudo) as ContratosProtheus
  } catch {
    return null
  }
}

/** O que a tela recebe: o cache, ou um aviso enquanto o worker não sincronizou. */
export async function listarContratosProtheus(): Promise<ContratosProtheus> {
  return (
    (await lerCacheContratosProtheus()) ?? {
      atualizadoEm: null,
      contratos: [],
      erro: 'Os contratos do Protheus ainda não foram sincronizados. Tente novamente em alguns minutos.',
    }
  )
}
