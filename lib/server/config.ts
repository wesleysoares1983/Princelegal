/**
 * Variaveis de ambiente do servidor, lidas sob demanda.
 *
 * Ler na hora (e nao no carregamento do modulo) deixa o `next build` rodar
 * sem o .env -- mas a primeira requisicao que precisar de uma variavel
 * ausente falha com uma mensagem que diz qual falta, em vez de seguir com
 * `undefined` e virar um erro confuso la na frente.
 */

function exigir(nome: string): string {
  const valor = process.env[nome]?.trim()
  if (!valor) throw new Error(`Configuração ausente: defina ${nome} no .env`)
  return valor
}

export interface ConfigAppsPrincesa {
  /** URL base dos Apps Princesa, sem barra no final. */
  url: string
  chaveInterna: string
  appId: number
}

export function configAppsPrincesa(): ConfigAppsPrincesa {
  const appId = Number(exigir('APP_ID'))
  if (!Number.isInteger(appId) || appId <= 0) {
    throw new Error('Configuração inválida: APP_ID deve ser um número inteiro positivo')
  }
  return {
    url: exigir('APPS_PRINCESA_URL').replace(/\/+$/, ''),
    chaveInterna: exigir('APPS_INTERNAL_KEY'),
    appId,
  }
}

/** Segredo que assina o cookie de sessao. Curto demais = assinatura facil de quebrar. */
export function segredoSessao(): string {
  const segredo = exigir('SESSION_SECRET')
  if (segredo.length < 32) {
    throw new Error('Configuração inválida: SESSION_SECRET precisa de pelo menos 32 caracteres')
  }
  return segredo
}
