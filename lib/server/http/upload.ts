import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { configArmazenamento } from '../config'
import { ErroApi, erroValidacao } from './erros'

/**
 * Upload de documentos: ler o multipart e validar o arquivo
 * (docs/BACKEND_IMPLEMENTATION.md §7.7).
 *
 * O tipo e decidido pelo CONTEUDO, nao pelo que o navegador diz nem so pela
 * extensao: um executavel renomeado para .pdf e recusado (415). A extensao
 * tambem precisa bater com o conteudo -- um .docx que na verdade e PDF e
 * recusado, porque seria baixado com a extensao errada.
 */

export type FormatoArquivo = 'pdf' | 'doc' | 'docx'

const MIME: Record<FormatoArquivo, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export interface ArquivoValidado {
  bytes: Uint8Array
  nomeArquivo: string
  formato: FormatoArquivo
  mime: string
  tamanhoBytes: number
  sha256: string
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0) {
  return assinatura.every((b, i) => bytes[deslocamento + i] === b)
}

function contem(bytes: Uint8Array, texto: string, limite = bytes.length): boolean {
  const alvo = Buffer.from(texto, 'latin1')
  return Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(limite, bytes.length)).includes(alvo)
}

/** Formato pelo conteudo; null se nao for PDF/DOC/DOCX. */
export function detectarFormato(bytes: Uint8Array): FormatoArquivo | null {
  // PDF: "%PDF-" -- a especificacao tolera lixo antes do cabecalho, ate 1 KB.
  if (contem(bytes, '%PDF-', 1024)) return 'pdf'
  // DOC (Word 97-2003): container OLE.
  if (comeca(bytes, OLE)) return 'doc'
  // DOCX: ZIP ("PK\3\4") com word/document.xml (nomes ficam em claro no ZIP).
  if (comeca(bytes, [0x50, 0x4b, 0x03, 0x04]) && contem(bytes, 'word/document.xml')) return 'docx'
  return null
}

/**
 * Nome para exibir: sem pasta, sem caracteres de controle, ate 200 caracteres
 * preservando a extensao. Nunca vira caminho no disco (a chave e gerada).
 */
export function sanitizarNome(original: string, formato: FormatoArquivo): string {
  const semPasta = original.split(/[\\/]/).pop() ?? ''
  let nome = semPasta
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const extensao = `.${formato}`
  if (!nome.toLowerCase().endsWith(extensao)) nome = `${nome.replace(/\.[^.]*$/, '') || 'documento'}${extensao}`
  if (nome.length > 200) nome = `${nome.slice(0, 200 - extensao.length).trim()}${extensao}`
  return nome === extensao ? `documento${extensao}` : nome
}

export function validarArquivo(arquivo: { name: string; bytes: Uint8Array }, maxBytes = configArmazenamento().maxBytes): ArquivoValidado {
  const { bytes } = arquivo
  if (bytes.length === 0) throw erroValidacao({ arquivo: 'O arquivo está vazio.' })
  if (bytes.length > maxBytes) {
    throw new ErroApi('ARQUIVO_GRANDE', `Arquivo grande demais: o limite é ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  }

  const formato = detectarFormato(bytes)
  const extensao = /\.([a-z0-9]+)$/i.exec(arquivo.name)?.[1]?.toLowerCase()
  if (!formato || extensao !== formato) {
    throw new ErroApi(
      'TIPO_NAO_SUPORTADO',
      formato
        ? `O conteúdo é ${formato.toUpperCase()}, mas o nome termina em ".${extensao ?? ''}". Renomeie o arquivo com a extensão certa.`
        : 'Formato não aceito. Envie um PDF ou um Word (.doc/.docx).',
    )
  }

  return {
    bytes,
    nomeArquivo: sanitizarNome(arquivo.name, formato),
    formato,
    mime: MIME[formato],
    tamanhoBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

/**
 * Le um multipart/form-data: campos de texto + o arquivo do campo `arquivo`.
 * Recusa cedo (pelo Content-Length) o que passa muito do limite, sem ler o corpo.
 */
export async function lerMultipart(req: NextRequest): Promise<{ campos: Record<string, string>; arquivo: { name: string; bytes: Uint8Array } | null }> {
  const { maxBytes } = configArmazenamento()
  const tamanho = Number(req.headers.get('content-length'))
  if (tamanho > maxBytes + 1024 * 1024) {
    throw new ErroApi('ARQUIVO_GRANDE', `Arquivo grande demais: o limite é ${Math.round(maxBytes / 1024 / 1024)} MB.`)
  }
  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    throw erroValidacao({}, 'Envie o arquivo como multipart/form-data.')
  }

  const form = await req.formData()
  const campos: Record<string, string> = {}
  let arquivo: { name: string; bytes: Uint8Array } | null = null
  for (const [chave, valor] of form.entries()) {
    if (typeof valor === 'string') campos[chave] = valor
    else if (chave === 'arquivo' && valor.size > 0) arquivo = { name: valor.name, bytes: new Uint8Array(await valor.arrayBuffer()) }
  }
  return { campos, arquivo }
}

/**
 * Corpo que pode vir como JSON ou como multipart com `dados` (o mesmo JSON,
 * como texto) + `arquivo`. Usado no cadastro, no aditivo e na renovacao, que
 * aceitam o documento assinado no mesmo pedido.
 */
export async function lerCorpoComArquivo(req: NextRequest): Promise<{ corpo: unknown; arquivo?: ArquivoValidado }> {
  if (!req.headers.get('content-type')?.includes('multipart/form-data')) return { corpo: await req.json() }
  const { campos, arquivo } = await lerMultipart(req)
  let corpo: unknown
  try {
    corpo = JSON.parse(campos.dados ?? '')
  } catch {
    throw erroValidacao({ dados: 'Envie os dados no campo "dados" (JSON).' })
  }
  return { corpo, arquivo: arquivo ? validarArquivo(arquivo) : undefined }
}
