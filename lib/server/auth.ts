import type { UsuarioSessao } from '@/lib/usuario'
import { erroSemPermissao } from './http/erros'

/**
 * Checagens de papel para servicos e rotas.
 *
 * A sessao chega pronta pelo `rota()` (o proxy ja a revalidou contra os Apps
 * Princesa); aqui so se decide o que o papel permite. Regras por contrato
 * (restrito, envolvido) ficam em permissoes.ts, junto dos contratos (M2).
 */
export function ehAdmin(usuario: UsuarioSessao): boolean {
  return usuario.nivel === 'admin'
}

export function exigirAdmin(usuario: UsuarioSessao): void {
  if (!ehAdmin(usuario)) throw erroSemPermissao('Apenas administradores podem fazer isto.')
}
