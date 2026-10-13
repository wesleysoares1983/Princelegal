import { describe, expect, it } from 'vitest'
import { ErroApi } from './erros'
import { LimitePorUsuario } from './limiteUpload'

const MIN = 60_000

function relogio() {
  let t = 1_000_000
  return { agora: () => t, andar: (ms: number) => (t += ms) }
}

const erroDe = (f: () => void) => {
  try {
    f()
  } catch (e) {
    return e as ErroApi
  }
  throw new Error('não lançou')
}

describe('LimitePorUsuario', () => {
  it('conta envios por usuário; o seguinte passa do limite com 429 e o tempo de espera', () => {
    const r = relogio()
    const limite = new LimitePorUsuario({ envios: 3, bytes: 1e9, janelaMs: 60 * MIN }, r.agora)
    for (let i = 0; i < 3; i++) {
      limite.consumir('A', 100)
      r.andar(MIN)
    }
    limite.consumir('B', 100) // outro usuário não é afetado
    const e = erroDe(() => limite.consumir('A', 100))
    expect(e.status).toBe(429)
    expect(e.codigo).toBe('LIMITE_EXCEDIDO')
    expect(e.message).toMatch(/57 minutos/)
    expect(e.corpo().erro.detalhes).toEqual({ tenteEmSegundos: 57 * 60 })
  })

  it('janela deslizante: libera quando o envio mais antigo sai da janela', () => {
    const r = relogio()
    const limite = new LimitePorUsuario({ envios: 2, bytes: 1e9, janelaMs: 10 * MIN }, r.agora)
    limite.consumir('A', 1)
    r.andar(5 * MIN)
    limite.consumir('A', 1)
    expect(() => limite.consumir('A', 1)).toThrow()
    r.andar(5 * MIN + 1)
    expect(() => limite.consumir('A', 1)).not.toThrow()
  })

  it('limite de bytes na janela', () => {
    const r = relogio()
    const limite = new LimitePorUsuario({ envios: 100, bytes: 1000, janelaMs: 60 * MIN }, r.agora)
    limite.consumir('A', 600)
    expect(() => limite.consumir('A', 500)).toThrow(/Muitos arquivos/)
    limite.consumir('A', 400)
  })

  it('envio recusado não conta', () => {
    const r = relogio()
    const limite = new LimitePorUsuario({ envios: 1, bytes: 1e9, janelaMs: MIN }, r.agora)
    limite.consumir('A', 1)
    expect(() => limite.consumir('A', 1)).toThrow()
    r.andar(MIN + 1)
    expect(() => limite.consumir('A', 1)).not.toThrow()
  })
})
