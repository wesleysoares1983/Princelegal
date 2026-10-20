/**
 * Usuario logado, como o app enxerga.
 *
 * Os dados vem do cadastro central (Apps Princesa) no login; o `nivel` e
 * derivado do cargo do usuario NESTE app, sempre pelo nome exato:
 *
 * - "ADMIN" -> administrador: o unico que cadastra e altera;
 * - "FUNCIONARIO" (o cargo padrao), cargo vazio ou qualquer outro nome ->
 *   somente leitura. Um cargo novo criado no cadastro central nunca ganha
 *   poder de escrita por acidente.
 */

export type NivelUsuario = 'admin' | 'leitura'

/** Cargo padrao no cadastro central: somente leitura. */
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
  return cargo === 'ADMIN' ? 'admin' : 'leitura'
}

/** Cadastrar, editar, anexar, cumprir... Tudo que nao e so consultar. */
export function podeEscrever(usuario: Pick<UsuarioSessao, 'nivel'> | null | undefined): boolean {
  return usuario?.nivel === 'admin'
}
