import { ErroApi } from './erros'

/**
 * Limite de envio de arquivos por usuário (docs/BACKEND_IMPLEMENTATION.md §12):
 * protege disco e servidor de um script ou de um clique repetido em loop.
 *
 * Janela deslizante em memória: o app roda num processo só (um container),
 * então não precisa de Redis. Reiniciar o app zera as contagens, o que não
 * é problema para um limite de proteção.
 *
 * O limite é folgado para uso humano: cadastrar contratos com o PDF anexo,
 * um atrás do outro, não chega perto.
 */

export interface Cota {
  /** Envios por janela. */
  envios: number
  /** Bytes por janela. */
  bytes: number
  janelaMs: number
}

export const COTA_UPLOAD: Cota = { envios: 60, bytes: 1024 * 1024 * 1024, janelaMs: 60 * 60 * 1000 }

export class LimitePorUsuario {
  private readonly registros = new Map<string, { em: number; bytes: number }[]>()

  constructor(
    private readonly cota: Cota,
    private readonly agora: () => number = Date.now,
  ) {}

  private recentes(chave: string) {
    const limite = this.agora() - this.cota.janelaMs
    const lista = (this.registros.get(chave) ?? []).filter((r) => r.em > limite)
    if (lista.length) this.registros.set(chave, lista)
    else this.registros.delete(chave)
    return lista
  }

  /** Confere e já registra o envio; 429 se passar da cota. */
  consumir(chave: string, bytes: number) {
    const lista = this.recentes(chave)
    const usados = lista.reduce((s, r) => s + r.bytes, 0)
    if (lista.length + 1 > this.cota.envios || usados + bytes > this.cota.bytes) {
      // Libera quando o envio mais antigo da janela sair dela.
      const segundos = lista.length ? Math.max(1, Math.ceil((lista[0].em + this.cota.janelaMs - this.agora()) / 1000)) : 1
      const minutos = Math.ceil(segundos / 60)
      throw new ErroApi(
        'LIMITE_EXCEDIDO',
        `Muitos arquivos enviados em pouco tempo. Tente de novo em ${minutos} minuto${minutos === 1 ? '' : 's'}.`,
        { detalhes: { tenteEmSegundos: segundos } },
      )
    }
    lista.push({ em: this.agora(), bytes })
    this.registros.set(chave, lista)
  }
}

export const limiteUpload = new LimitePorUsuario(COTA_UPLOAD)
