import type { PermissoesContrato } from '@/lib/shared/contratos'
import type { UsuarioSessao } from '@/lib/usuario'
import { ehAdmin } from './auth'

/**
 * Quem pode o que em cada contrato (docs/BACKEND_IMPLEMENTATION.md §5.4–5.5).
 *
 * "Envolvido" = o e-mail da sessao e o e-mail digitado de gestor ou de
 * responsavel juridico do contrato (aparado, sem diferenciar maiuscula). E o
 * que da acesso a contrato restrito. O mesmo criterio existe em SQL
 * (db/consultas/contratos.ts, sqlVisivel) para as listas.
 */

export interface PessoasDoContrato {
  gestorEmail: string
  responsavelJuridicoEmail: string
  acessoRestrito: boolean
}

const normalizar = (email: string) => email.trim().toLowerCase()

export function ehEnvolvido(usuario: UsuarioSessao, c: Pick<PessoasDoContrato, 'gestorEmail' | 'responsavelJuridicoEmail'>): boolean {
  const meu = normalizar(usuario.email)
  return normalizar(c.gestorEmail) === meu || normalizar(c.responsavelJuridicoEmail) === meu
}

export function podeVer(usuario: UsuarioSessao, c: PessoasDoContrato): boolean {
  return !c.acessoRestrito || ehAdmin(usuario) || ehEnvolvido(usuario, c)
}

/**
 * Com a restricao como ficaria, o usuario continuaria vendo o contrato?
 * Usado para nao deixar alguem se trancar fora do que acabou de criar/editar.
 */
export function continuariaVendo(usuario: UsuarioSessao, resultado: PessoasDoContrato): boolean {
  return podeVer(usuario, resultado)
}

export function permissoesDoContrato(
  usuario: UsuarioSessao,
  c: PessoasDoContrato & { encerradoEm: string | null; motivoEncerramento: 'manual' | 'renovado' | null },
): PermissoesContrato {
  const aberto = c.encerradoEm === null
  // Chegou ate aqui = pode ver; ver um contrato aberto permite editar (§5.5).
  const editar = aberto && podeVer(usuario, c)
  return {
    editar,
    alterarRestricao: aberto && (ehAdmin(usuario) || ehEnvolvido(usuario, c)),
    encerrar: aberto && ehAdmin(usuario),
    reabrir: c.motivoEncerramento === 'manual' && ehAdmin(usuario),
    // Aditivo e renovacao chegam no M4; a permissao ja segue a regra deles.
    registrarAditivo: editar,
    renovar: editar,
  }
}
