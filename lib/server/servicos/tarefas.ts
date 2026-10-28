import 'server-only'
import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { hojeSP } from '@/lib/shared/datas'
import type { ColunaTarefa, DadosCriarTarefa, FiltroTarefas, QuadroTarefas, Tarefa } from '@/lib/shared/tarefas'
import type { UsuarioSessao } from '@/lib/usuario'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { exigirCadastro } from '../auth'
import { db, type Executor } from '../db/cliente'
import { contratos, tarefas } from '../db/esquema'
import { erroNaoEncontrado } from '../http/erros'
import { podeVer } from '../permissoes'
import { obterUsuariosDoApp } from '../usuariosApp'
import { carregar, isoInstante, type Linha as LinhaContrato } from './contratos'

/**
 * Tarefas do quadro (docs/TASKS_IMPLEMENTATION_PLAN.md §5.1).
 *
 * - Todos veem todas as tarefas; admin e funcionário criam, movem e excluem.
 * - O vínculo com contrato só aparece para quem vê o contrato; para os
 *   demais, a tarefa diz apenas que há um vínculo restrito.
 * - Os eventos vão para a auditoria com `categoria: 'tarefa'` e SEM
 *   `contratoId`: a trilha do próprio contrato não recebe eventos de tarefa.
 *   O vínculo fica em `dados.contratoId`.
 */

type Linha = typeof tarefas.$inferSelect
const carimboDe = (u: UsuarioSessao) => ({ matricula: u.matricula, nome: u.nome })

function paraTarefa(t: Linha, c: LinhaContrato | null, usuario: UsuarioSessao, hoje: string): Tarefa {
  const visivel = c !== null && podeVer(usuario, c)
  return {
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    responsavel: t.responsavel,
    prazo: t.prazo,
    atrasada: t.coluna !== 'Concluída' && t.prazo !== null && t.prazo < hoje,
    coluna: t.coluna,
    contrato: visivel ? { id: c.id, codigo: c.codigo, nome: c.nome, encerrado: c.encerradoEm !== null } : null,
    vinculoRestrito: c !== null && !visivel,
    criadoPor: { matricula: t.criadoPorMatricula, nome: t.criadoPorNome },
    criadoEm: isoInstante(t.criadoEm),
    versao: t.versao,
  }
}

/** Tarefa ativa (não excluída) + contrato vinculado; 404 se não existe. */
async function carregarTarefa(ex: Executor, id: string, travar = false) {
  const consulta = ex
    .select({ t: tarefas, c: contratos })
    .from(tarefas)
    .leftJoin(contratos, eq(contratos.id, tarefas.contratoId))
    .where(and(eq(tarefas.id, id), isNull(tarefas.removidaEm)))
  const [linha] = travar ? await consulta.for('update', { of: tarefas }) : await consulta
  if (!linha) throw erroNaoEncontrado('Tarefa não encontrada.')
  return linha
}

// ---------------------------------------------------------------- leitura

/**
 * O quadro: todas as abertas (por criação) e as concluídas que entraram na
 * coluna mais recentemente, até `limiteConcluidas`.
 */
export async function listarTarefas(usuario: UsuarioSessao, f: FiltroTarefas, hoje: string = hojeSP()): Promise<QuadroTarefas> {
  const base = () => db.select({ t: tarefas, c: contratos }).from(tarefas).leftJoin(contratos, eq(contratos.id, tarefas.contratoId))
  const ativa = isNull(tarefas.removidaEm)

  const [abertas, concluidas, responsaveis] = await Promise.all([
    base()
      .where(and(ativa, ne(tarefas.coluna, 'Concluída')))
      .orderBy(asc(tarefas.criadoEm), asc(tarefas.id)),
    base()
      .where(and(ativa, eq(tarefas.coluna, 'Concluída')))
      .orderBy(desc(tarefas.colunaDesde), desc(tarefas.id))
      .limit(f.limiteConcluidas + 1),
    sugestoesDeResponsavel(),
  ])

  return {
    itens: [...abertas, ...concluidas.slice(0, f.limiteConcluidas)].map((l) => paraTarefa(l.t, l.c, usuario, hoje)),
    maisConcluidas: concluidas.length > f.limiteConcluidas,
    facetas: { responsaveis },
  }
}

/** Usuários ativos do app (cópia em cache dos Apps Princesa) + responsáveis já usados. */
async function sugestoesDeResponsavel(): Promise<string[]> {
  const [listagem, usados] = await Promise.all([
    obterUsuariosDoApp().catch(() => null),
    db
      .selectDistinct({ r: tarefas.responsavel })
      .from(tarefas)
      .where(and(isNull(tarefas.removidaEm), isNotNull(tarefas.responsavel))),
  ])
  const nomes = new Set([...(listagem?.usuarios.filter((u) => u.ativo).map((u) => u.nome) ?? []), ...usados.map((u) => u.r!)])
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

// ---------------------------------------------------------------- escrita

export async function criarTarefa(
  usuario: UsuarioSessao,
  dados: DadosCriarTarefa,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<Tarefa> {
  exigirCadastro(usuario)
  return db.transaction(async (tx) => {
    // Só vincula contrato que o usuário vê (404 como em qualquer outro caminho).
    const c = dados.contratoId ? await carregar(tx, usuario, dados.contratoId) : null
    const quem = carimboDe(usuario)
    const [t] = await tx
      .insert(tarefas)
      .values({
        titulo: dados.titulo,
        descricao: dados.descricao,
        responsavel: dados.responsavel,
        prazo: dados.prazo,
        coluna: dados.coluna,
        contratoId: c?.id ?? null,
        criadoPorMatricula: quem.matricula,
        criadoPorNome: quem.nome,
      })
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'tarefa',
        acao: 'tarefa.criada',
        descricao: `Criou a tarefa “${t.titulo}” em “${t.coluna}”`,
        dados: { tarefaId: t.id, ...(c ? { contratoId: c.id } : {}) },
      },
      contexto,
    )
    return paraTarefa(t, c, usuario, hoje)
  })
}

/** Qualquer coluna para qualquer coluna; soltar na mesma coluna não muda nada nem audita. */
export async function moverTarefa(
  usuario: UsuarioSessao,
  id: string,
  coluna: ColunaTarefa,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<Tarefa> {
  exigirCadastro(usuario)
  return db.transaction(async (tx) => {
    // Travada: com dois movendo o mesmo cartão, o "de" da auditoria é sempre a coluna real.
    const { t, c } = await carregarTarefa(tx, id, true)
    if (t.coluna === coluna) return paraTarefa(t, c, usuario, hoje)

    const [movida] = await tx
      .update(tarefas)
      .set({ coluna, colunaDesde: sql`now()` })
      .where(eq(tarefas.id, t.id))
      .returning()
    await registrarAuditoria(
      tx,
      {
        usuario: carimboDe(usuario),
        categoria: 'tarefa',
        acao: 'tarefa.movida',
        descricao: `Moveu a tarefa “${t.titulo}” de “${t.coluna}” para “${coluna}”`,
        dados: { tarefaId: t.id, de: t.coluna, para: coluna },
      },
      contexto,
    )
    return paraTarefa(movida, c, usuario, hoje)
  })
}

/** Exclusão lógica, com justificativa (fica na linha e na auditoria). */
export async function removerTarefa(usuario: UsuarioSessao, id: string, justificativa: string, contexto: ContextoAuditoria): Promise<null> {
  exigirCadastro(usuario)
  return db.transaction(async (tx) => {
    const { t } = await carregarTarefa(tx, id, true)
    const quem = carimboDe(usuario)
    await tx
      .update(tarefas)
      .set({ removidaEm: sql`now()`, removidaPorMatricula: quem.matricula, removidaPorNome: quem.nome, motivoRemocao: justificativa })
      .where(eq(tarefas.id, t.id))
    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'tarefa',
        acao: 'tarefa.removida',
        descricao: `Excluiu a tarefa “${t.titulo}” (estava em “${t.coluna}”). Justificativa: ${justificativa}`,
        dados: { tarefaId: t.id, coluna: t.coluna, justificativa },
      },
      contexto,
    )
    return null
  })
}
