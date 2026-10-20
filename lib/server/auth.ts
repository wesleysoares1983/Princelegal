import { podeEscrever, type UsuarioSessao } from '@/lib/usuario'
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

/** Barra o nivel somente leitura em toda escrita (vem antes de qualquer outra regra). */
export function exigirEscrita(usuario: UsuarioSessao): void {
  if (!podeEscrever(usuario)) throw erroSemPermissao('Seu acesso é somente leitura.')
}
