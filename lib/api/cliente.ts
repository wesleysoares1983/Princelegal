/**
 * Chamadas do navegador para /api/v1.
 *
 * Erros chegam no envelope padrao (`{ erro: { codigo, mensagem, campos?,
 * detalhes? } }`) e viram `ErroDaApi`, com a mensagem ja pronta para a tela.
 * Sessao expirada (401) leva ao login, guardando a pagina atual.
 */

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos: Record<string, string> = {},
    readonly detalhes?: unknown,
  ) {
    super(mensagem)
    this.name = 'ErroDaApi'
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export async function chamarApi<T>(metodo: Metodo, caminho: string, corpo?: unknown): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`/api/v1${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: 'no-store',
    })
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. Verifique a rede e tente novamente.')
  }

  const dados = await resposta.json().catch(() => null)
  if (resposta.ok) return dados as T

  if (resposta.status === 401 && typeof window !== 'undefined') {
    const destino = window.location.pathname + window.location.search
    window.location.assign(`/login?destino=${encodeURIComponent(destino)}`)
  }
  const erro = dados?.erro
  throw new ErroDaApi(
    resposta.status,
    erro?.codigo ?? 'ERRO_INTERNO',
    erro?.mensagem ?? 'Erro inesperado. Tente novamente.',
    erro?.campos ?? {},
    erro?.detalhes,
  )
}
