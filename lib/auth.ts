/**
 * Sessao local, sem backend.
 *
 * Guarda so um sinalizador no navegador -- "Lembrar de mim" usa localStorage
 * (sobrevive a fechar a aba), sem ele usa sessionStorage (esquece ao fechar).
 * Quando o projeto ganhar uma API de verdade, `entrar`/`estaAutenticado`/`sair`
 * viram chamadas reais sem precisar mudar quem os usa.
 */

const CHAVE = 'contratos-juridicos:auth'

export function entrar(email: string, lembrar: boolean) {
  const registro = JSON.stringify({ email, em: new Date().toISOString() })
  try {
    if (lembrar) {
      localStorage.setItem(CHAVE, registro)
    } else {
      sessionStorage.setItem(CHAVE, registro)
    }
  } catch {
    // Armazenamento bloqueado: a sessao nao sobrevive a navegacao nesta aba.
  }
}

export function estaAutenticado(): boolean {
  try {
    return !!(localStorage.getItem(CHAVE) || sessionStorage.getItem(CHAVE))
  } catch {
    return false
  }
}

export function usuarioAtual(): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE) || sessionStorage.getItem(CHAVE)
    return bruto ? (JSON.parse(bruto).email ?? null) : null
  } catch {
    return null
  }
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE)
    sessionStorage.removeItem(CHAVE)
  } catch {
    // idem
  }
}
