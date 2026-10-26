/**
 * Tarefas de uso geral — nao pertencem a um contrato, mas podem referenciar
 * um opcionalmente (contratoId). Mesmo padrao de dados de exemplo em memoria
 * usado em contratos.ts, ate ganhar uma API de verdade.
 *
 * TAREFAS e AUDITORIA_TAREFAS sao mutados diretamente (em vez de so viverem
 * em useState) para que mover um cartao entre colunas fique registrado e
 * visivel na aba Auditoria geral, nao soo dentro da tela de Tarefas.
 */
import type { EventoAuditoria } from './tipos'

export type ColunaTarefa = 'A fazer' | 'Em andamento' | 'Concluída'

export interface Tarefa {
  id: string
  titulo: string
  descricao?: string
  responsavel?: string // nome de quem responde pela tarefa, digitado livremente
  prazo?: string // ISO
  coluna: ColunaTarefa
  contratoId?: string
  criadoEm: string // ISO
}

export const COLUNAS_TAREFA: ColunaTarefa[] = ['A fazer', 'Em andamento', 'Concluída']

export const TAREFAS: Tarefa[] = []
export const AUDITORIA_TAREFAS: EventoAuditoria[] = []

export function listarTarefas(): Tarefa[] {
  return TAREFAS
}

export function listarAuditoriaTarefas(): EventoAuditoria[] {
  return AUDITORIA_TAREFAS
}

export function adicionarTarefa(tarefa: Tarefa, usuario: string) {
  TAREFAS.push(tarefa)
  AUDITORIA_TAREFAS.push({
    id: `aud-tarefa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    data: new Date().toISOString().slice(0, 10),
    usuario,
    acao: `Criou a tarefa "${tarefa.titulo}" em "${tarefa.coluna}"`,
  })
}

export function moverTarefaColuna(idTarefa: string, coluna: ColunaTarefa, usuario: string) {
  const tarefa = TAREFAS.find((t) => t.id === idTarefa)
  if (!tarefa || tarefa.coluna === coluna) return
  const colunaAnterior = tarefa.coluna
  tarefa.coluna = coluna
  AUDITORIA_TAREFAS.push({
    id: `aud-tarefa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    data: new Date().toISOString().slice(0, 10),
    usuario,
    acao: `Moveu a tarefa "${tarefa.titulo}" de "${colunaAnterior}" para "${coluna}"`,
  })
}

export function removerTarefa(idTarefa: string, usuario: string, justificativa: string) {
  const indice = TAREFAS.findIndex((t) => t.id === idTarefa)
  if (indice === -1) return
  const [tarefa] = TAREFAS.splice(indice, 1)
  AUDITORIA_TAREFAS.push({
    id: `aud-tarefa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    data: new Date().toISOString().slice(0, 10),
    usuario,
    acao: `Excluiu a tarefa "${tarefa.titulo}" (estava em "${tarefa.coluna}"). Justificativa: ${justificativa}`,
  })
}
