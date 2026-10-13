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
    // FormData (upload) vai como esta: o navegador monta o multipart e o boundary.
    const formulario = corpo instanceof FormData
    resposta = await fetch(`/api/v1${caminho}`, {
      method: metodo,
      headers: corpo === undefined || formulario ? undefined : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
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

/** Nome do arquivo no Content-Disposition (prefere o `filename*` UTF-8). */
function nomeDoArquivo(cabecalho: string | null, padrao: string): string {
  const utf8 = cabecalho?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) return decodeURIComponent(utf8)
  return cabecalho?.match(/filename="([^"]+)"/i)?.[1] ?? padrao
}

/**
 * Baixa um arquivo de /api/v1 (exportações). Diferente de um link direto, um
 * erro (ex.: 422 "use mais filtros") volta como `ErroDaApi` para a tela, em
 * vez de abrir o JSON de erro no navegador.
 */
export async function baixarArquivo(caminho: string, nomePadrao = 'arquivo'): Promise<void> {
  let resposta: Response
  try {
    resposta = await fetch(`/api/v1${caminho}`, { cache: 'no-store' })
  } catch {
    throw new ErroDaApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. Verifique a rede e tente novamente.')
  }
  if (!resposta.ok) {
    const erro = (await resposta.json().catch(() => null))?.erro
    if (resposta.status === 401) window.location.assign(`/login?destino=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    throw new ErroDaApi(resposta.status, erro?.codigo ?? 'ERRO_INTERNO', erro?.mensagem ?? 'Erro inesperado. Tente novamente.', erro?.campos ?? {}, erro?.detalhes)
  }
  const url = URL.createObjectURL(await resposta.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = nomeDoArquivo(resposta.headers.get('Content-Disposition'), nomePadrao)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
