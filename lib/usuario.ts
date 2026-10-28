/**
 * Usuario logado, como o app enxerga.
 *
 * Os dados vem do cadastro central (Apps Princesa) no login; o `nivel` e
 * derivado do cargo do usuario NESTE app, sempre pelo nome exato:
 *
 * - "ADMIN" -> administrador: faz tudo;
 * - "FUNCIONARIO" (o cargo padrao) -> cadastra e edita contratos e faz
 *   tudo em obrigacoes e tarefas; documentos, aditivos, renovacao e
 *   encerramento so consulta;
 * - cargo vazio ou qualquer outro nome -> somente leitura. Um cargo novo
 *   criado no cadastro central nunca ganha poder de escrita por acidente.
 */

export type NivelUsuario = 'admin' | 'funcionario' | 'leitura'

/** Cargo padrao no cadastro central: cadastra (ver `podeCadastrar`). */
export const CARGO_PADRAO = 'FUNCIONARIO'

export interface UsuarioSessao {
  matricula: string
  nome: string
  email: string
  perfil: string | null
  cargo: string | null
  nivel: NivelUsuario
}

export function nivelDoCargo(cargo: string | null | undefined): NivelUsuario {
  if (cargo === 'ADMIN') return 'admin'
  if (cargo === CARGO_PADRAO) return 'funcionario'
  return 'leitura'
}

/** Cadastrar/editar contrato e tudo em obrigacoes e tarefas (admin e funcionario). */
export function podeCadastrar(usuario: Pick<UsuarioSessao, 'nivel'> | null | undefined): boolean {
  return usuario?.nivel === 'admin' || usuario?.nivel === 'funcionario'
}

/** Toda outra escrita: documentos, aditivo, renovacao (so admin). */
export function podeEscrever(usuario: Pick<UsuarioSessao, 'nivel'> | null | undefined): boolean {
  return usuario?.nivel === 'admin'
}
