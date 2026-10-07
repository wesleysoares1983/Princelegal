/**
 * Usuario logado, como o app enxerga.
 *
 * Os dados vem do cadastro central (Apps Princesa) no login; o `nivel` e
 * derivado do cargo do usuario NESTE app: so o cargo exatamente "ADMIN" da
 * acesso de administrador. "USUARIO", cargo vazio ou qualquer outro nome
 * caem em usuario comum -- um cargo novo criado no cadastro central nunca
 * vira admin por acidente.
 */

export type NivelUsuario = 'admin' | 'user'

export interface UsuarioSessao {
  matricula: string
  nome: string
  email: string
  perfil: string | null
  cargo: string | null
  nivel: NivelUsuario
}

export function nivelDoCargo(cargo: string | null | undefined): NivelUsuario {
  return cargo === 'ADMIN' ? 'admin' : 'user'
}
