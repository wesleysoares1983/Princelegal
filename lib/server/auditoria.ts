import 'server-only'
import type { UsuarioSessao } from '@/lib/usuario'
import type { Executor } from './db/cliente'
import { auditoria } from './db/esquema'

/**
 * Grava um evento na trilha de auditoria.
 *
 * Deve receber a MESMA transacao da mudanca que registra: se a mudanca falhar,
 * o evento some junto; se o evento falhar, a mudanca nao acontece. Quem fez
 * vem sempre da sessao (nunca do corpo da requisicao); `usuario: null` = Sistema.
 */

/** Origem da requisicao, recolhida pelo `rota()`. */
export interface ContextoAuditoria {
  ip: string | null
  userAgent: string | null
}

export interface EventoAuditoria {
  usuario: Pick<UsuarioSessao, 'matricula' | 'nome'> | null
  categoria: (typeof auditoria.$inferInsert)['categoria']
  /** Codigo de maquina, ex.: `opcao.criada`. */
  acao: string
  /** Frase para a tela, ex.: "Criou a opção Energia em Categoria". */
  descricao: string
  contratoId?: string | null
  dados?: unknown
}

export async function registrarAuditoria(executor: Executor, evento: EventoAuditoria, contexto?: ContextoAuditoria) {
  await executor.insert(auditoria).values({
    usuarioMatricula: evento.usuario?.matricula ?? null,
    usuarioNome: evento.usuario?.nome ?? null,
    contratoId: evento.contratoId ?? null,
    categoria: evento.categoria,
    acao: evento.acao,
    descricao: evento.descricao,
    dados: evento.dados ?? null,
    ip: contexto?.ip ?? null,
    userAgent: contexto?.userAgent?.slice(0, 500) ?? null,
  })
}
