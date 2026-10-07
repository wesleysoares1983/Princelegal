import type { UsuarioSessao } from '@/lib/usuario'
import { nivelDoCargo } from '@/lib/usuario'
import { listarUsuariosDoApp, type ListagemDoApp } from './appsPrincesa'

/**
 * Copia em memoria de "quem tem acesso a este app", vinda dos Apps Princesa.
 *
 * Serve para revalidar sessoes: o cadastro central nao avisa quando alguem e
 * desativado ou troca de cargo, entao a cada requisicao a sessao e conferida
 * contra esta copia. Para isso nao custar uma chamada por requisicao:
 *
 * - a copia vale VALIDADE_MS; depois disso ainda e usada, mas dispara uma
 *   atualizacao em segundo plano (quem pediu nao espera);
 * - so se espera a API quando nao ha copia nenhuma (primeira requisicao);
 * - chamadas simultaneas compartilham a mesma busca;
 * - se a API cair, a ultima copia boa continua valendo (falha aberta): uma
 *   queda dos Apps Princesa nao derruba a sessao de todo mundo.
 *
 * Fica em `globalThis` para o proxy e as paginas, quando no mesmo processo,
 * dividirem a mesma copia.
 */

const VALIDADE_MS = 5 * 60 * 1000
/** Antes de expulsar alguem, a copia precisa ser recente -- senao busca de novo. */
const RECENTE_MS = 30 * 1000

interface Cache {
  dados: ListagemDoApp | null
  obtidoEm: number
  buscando: Promise<ListagemDoApp | null> | null
}

const CHAVE = Symbol.for('contratos-juridicos.usuariosApp')
const g = globalThis as unknown as Record<symbol, Cache | undefined>
const cache: Cache = (g[CHAVE] ??= { dados: null, obtidoEm: 0, buscando: null })

function buscar(): Promise<ListagemDoApp | null> {
  cache.buscando ??= listarUsuariosDoApp()
    .then((dados) => {
      if (dados) {
        cache.dados = dados
        cache.obtidoEm = Date.now()
      }
      return cache.dados
    })
    .finally(() => {
      cache.buscando = null
    })
  return cache.buscando
}

/**
 * Listagem atual. `idadeMaximaMs` diz quao velha ela pode ser antes de
 * esperar uma busca nova; sem ele, devolve o que tiver e atualiza por tras.
 * `null` so quando a API nunca respondeu.
 */
export async function obterUsuariosDoApp(idadeMaximaMs?: number): Promise<ListagemDoApp | null> {
  const idade = Date.now() - cache.obtidoEm
  if (!cache.dados || (idadeMaximaMs !== undefined && idade > idadeMaximaMs)) return buscar()
  if (idade > VALIDADE_MS) void buscar()
  return cache.dados
}

export type ResultadoRevalidacao =
  | { tipo: 'ok' }
  | { tipo: 'atualizado'; usuario: UsuarioSessao }
  | { tipo: 'revogado' }

function comparar(sessao: UsuarioSessao, listagem: ListagemDoApp): ResultadoRevalidacao {
  const atual = listagem.usuarios.find((u) => u.matricula === sessao.matricula)
  if (!atual || !atual.ativo) return { tipo: 'revogado' }

  const usuario: UsuarioSessao = {
    matricula: atual.matricula,
    nome: atual.nome,
    email: atual.email,
    perfil: atual.perfil,
    cargo: atual.cargo,
    nivel: nivelDoCargo(atual.cargo),
  }
  const mudou = (Object.keys(usuario) as (keyof UsuarioSessao)[]).some((k) => usuario[k] !== sessao[k])
  return mudou ? { tipo: 'atualizado', usuario } : { tipo: 'ok' }
}

/**
 * Confere a sessao contra o cadastro central.
 *
 * - sumiu da lista (perfil perdeu o app, app inativado) ou esta inativo -> revogado;
 * - nome/e-mail/perfil/cargo mudaram -> atualizado (o nivel acompanha o cargo);
 * - API indisponivel e sem copia -> ok (falha aberta).
 *
 * Um "revogado" so vale com uma copia recente: quem acabou de ganhar acesso
 * nao pode ser expulso por uma copia de antes da liberacao.
 */
export async function revalidarSessao(sessao: UsuarioSessao): Promise<ResultadoRevalidacao> {
  const listagem = await obterUsuariosDoApp()
  if (!listagem) return { tipo: 'ok' }

  const resultado = comparar(sessao, listagem)
  if (resultado.tipo !== 'revogado' || Date.now() - cache.obtidoEm <= RECENTE_MS) return resultado

  const fresca = await obterUsuariosDoApp(RECENTE_MS)
  // Se a busca falhou, `fresca` e a mesma copia antiga: na duvida, nao expulsa.
  if (!fresca || Date.now() - cache.obtidoEm > RECENTE_MS) return { tipo: 'ok' }
  return comparar(sessao, fresca)
}
