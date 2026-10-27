import 'server-only'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { configArmazenamento } from './config'
import type { ArquivoValidado, FormatoArquivo } from './http/upload'

/**
 * Onde os arquivos enviados moram: uma pasta no disco (em producao, o volume
 * do Docker). Interface pequena de proposito -- trocar por S3 depois e
 * reimplementar estas funcoes.
 *
 * - Chaves sao geradas pelo servidor (`contratos/<uuid>/<nome>-<uuid>.<ext>`) e
 *   validadas aqui: o nome original entra so depois de saneado, nunca como pasta.
 * - Gravacao em dois passos: `gravarTemporario` escreve em `.tmp/` (mesmo
 *   disco) e `efetivar` move para a chave final com `rename`, que e atomico.
 *   O servico efetiva DENTRO da transacao do banco, antes do commit: se o
 *   commit falhar, sobra um arquivo sem linha (a limpeza de orfaos remove);
 *   nunca sobra linha apontando para arquivo que nao existe.
 */

// `<radical>` e opcional e a extensao tambem: chaves antigas eram so o uuid.
const RE_CHAVE = /^contratos\/[0-9a-f-]{36}\/(?:[\p{L}\p{N} ._()-]{1,50}-)?[0-9a-f-]{36}(?:\.(?:pdf|docx?))?$/u
const PASTA_TEMP = '.tmp'
// 50 caracteres de ate 4 bytes + uuid + extensao cabem nos 255 bytes de um nome de arquivo.
const MAX_RADICAL = 50

function raiz(): string {
  return resolve(configArmazenamento().diretorio)
}

function caminhoDaChave(chave: string): string {
  if (!RE_CHAVE.test(chave)) throw new Error(`Chave de armazenamento inválida: ${chave}`)
  const caminho = resolve(raiz(), chave)
  // Defesa em profundidade: o caminho final tem de ficar dentro da raiz.
  if (relative(raiz(), caminho).startsWith('..')) throw new Error('Chave fora da pasta de armazenamento')
  return caminho
}

/**
 * Radical do nome original seguro para o disco: so letras, numeros, espaco e
 * `._()-` (nada de `<>:"|?*` nem separadores de pasta).
 */
function radicalSeguro(nomeArquivo: string): string {
  return Array.from(
    nomeArquivo
      .normalize('NFC')
      .replace(/\.[^.]*$/, '')
      .replace(/[^\p{L}\p{N} ._()-]/gu, '_'),
  )
    .slice(0, MAX_RADICAL)
    .join('')
}

/** `contratos/<contratoId>/<nome original>-<uuid>.<extensao>` -- o uuid evita colisao. */
export function novaChave(contratoId: string, nomeArquivo: string, formato: FormatoArquivo): string {
  const radical = radicalSeguro(nomeArquivo)
  return `contratos/${contratoId}/${radical ? `${radical}-` : ''}${randomUUID()}.${formato}`
}

/**
 * Confere, na subida do app e do worker, que a pasta existe e aceita escrita.
 * Em producao e um volume montado: dono errado (o container roda como o
 * usuario 1001) apareceria so no primeiro upload; assim o processo nem sobe.
 */
export async function verificarPastaGravavel(): Promise<void> {
  const pasta = join(raiz(), PASTA_TEMP)
  const teste = join(pasta, `.teste-escrita-${randomUUID()}`)
  try {
    await mkdir(pasta, { recursive: true })
    await writeFile(teste, '')
    await rm(teste, { force: true })
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro)
    throw new Error(`ARMAZENAMENTO_DIR sem permissão de escrita (${raiz()}): ${motivo}. No Docker, o dono da pasta montada deve ser o uid 1001.`)
  }
}

/** Escreve os bytes num arquivo temporario; devolve o caminho dele. */
export async function gravarTemporario(bytes: Uint8Array): Promise<string> {
  const pasta = join(raiz(), PASTA_TEMP)
  await mkdir(pasta, { recursive: true })
  const caminho = join(pasta, randomUUID())
  await writeFile(caminho, bytes, { flag: 'wx' })
  return caminho
}

/** Move o temporario para a chave final (rename atomico, mesmo disco). */
export async function efetivar(temporario: string, chave: string): Promise<void> {
  const destino = caminhoDaChave(chave)
  await mkdir(dirname(destino), { recursive: true })
  await rename(temporario, destino)
}

/** Apaga sem reclamar se ja nao existir (limpeza de temporario, de efetivado que nao vingou). */
export async function descartar(caminhoOuChave: string): Promise<void> {
  const caminho = RE_CHAVE.test(caminhoOuChave) ? caminhoDaChave(caminhoOuChave) : caminhoOuChave
  await rm(caminho, { force: true })
}

export async function abrir(chave: string): Promise<{ corpo: ReadableStream<Uint8Array>; tamanho: number }> {
  const caminho = caminhoDaChave(chave)
  const { size } = await stat(caminho)
  return { corpo: Readable.toWeb(createReadStream(caminho)) as ReadableStream<Uint8Array>, tamanho: size }
}

/**
 * Lista chaves existentes no disco (para a limpeza de orfaos) e temporarios
 * esquecidos, com a idade de cada um.
 */
export async function listarArquivos(): Promise<{ chave: string | null; caminho: string; modificadoEm: Date }[]> {
  const base = raiz()
  const saida: { chave: string | null; caminho: string; modificadoEm: Date }[] = []
  async function percorrer(pasta: string) {
    let entradas
    try {
      entradas = await readdir(pasta, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entradas) {
      const caminho = join(pasta, e.name)
      if (e.isDirectory()) await percorrer(caminho)
      else {
        const rel = relative(base, caminho).split(sep).join('/')
        saida.push({ chave: RE_CHAVE.test(rel) ? rel : null, caminho, modificadoEm: (await stat(caminho)).mtime })
      }
    }
  }
  await percorrer(base)
  return saida
}

/**
 * Arquivos gravados durante uma operacao com transacao no banco.
 *
 * `comGravacao(fn)` envolve a transacao inteira: se qualquer coisa falhar
 * (validacao, insert, o proprio commit), os arquivos ja efetivados nesta
 * operacao sao apagados. Sucesso = arquivos ficam; falha = nada sobra.
 */
export class Gravacao {
  private readonly efetivadas: string[] = []

  /** Grava os bytes e devolve a chave final (ja efetivada). */
  async gravar(contratoId: string, arquivo: Pick<ArquivoValidado, 'bytes' | 'nomeArquivo' | 'formato'>): Promise<string> {
    const temporario = await gravarTemporario(arquivo.bytes)
    const chave = novaChave(contratoId, arquivo.nomeArquivo, arquivo.formato)
    try {
      await efetivar(temporario, chave)
    } catch (erro) {
      await descartar(temporario)
      throw erro
    }
    this.efetivadas.push(chave)
    return chave
  }

  async desfazer(): Promise<void> {
    await Promise.all(this.efetivadas.map((c) => descartar(c).catch(() => {})))
  }
}

export async function comGravacao<T>(fn: (gravacao: Gravacao) => Promise<T>): Promise<T> {
  const gravacao = new Gravacao()
  try {
    return await fn(gravacao)
  } catch (erro) {
    await gravacao.desfazer()
    throw erro
  }
}
