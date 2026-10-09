import 'server-only'
import { and, asc, eq, max, ne, sql } from 'drizzle-orm'
import {
  CAMPOS_OPCAO,
  TITULO_CAMPO,
  type CampoOpcao,
  type DadosCriarOpcao,
  type DadosEditarOpcao,
  type Opcao,
  type OpcoesPorCampo,
} from '@/lib/shared/opcoes'
import type { UsuarioSessao } from '@/lib/usuario'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { ehAdmin, exigirAdmin } from '../auth'
import { db, type Executor } from '../db/cliente'
import { ehViolacaoUnica } from '../db/erros'
import { contratos, opcoesCadastro } from '../db/esquema'
import { erroConflito, erroNaoEncontrado, erroRegraNegocio } from '../http/erros'

/**
 * Opcoes de cadastro -- regras de negocio (docs/BACKEND_IMPLEMENTATION.md §8.11).
 *
 * - Ler: qualquer usuario (o formulario de contrato precisa); inativas so admin.
 * - Escrever: so admin. Toda mudanca entra na auditoria na mesma transacao.
 * - Opcao e unica por campo sem diferenciar acento nem maiuscula, contando as
 *   inativas: em vez de duplicar, a tela oferece reativar.
 * - "Remover" e desativar; a ultima opcao ativa de um campo nao pode sair,
 *   porque todos os campos sao obrigatorios no formulario de contrato.
 */

type Linha = typeof opcoesCadastro.$inferSelect

function paraOpcao(l: Linha): Opcao {
  return { id: l.id, campo: l.campo, valor: l.valor, ativo: l.ativo, ordem: l.ordem, versao: l.versao }
}

const UNICA = 'opcoes_cadastro_campo_valor_unico'
const mesmoValor = (valor: string) =>
  sql`lower(f_unaccent(${opcoesCadastro.valor})) = lower(f_unaccent(${valor}))`

/** Outra opcao do campo com o mesmo valor (sem acento/maiuscula), se houver. */
async function buscarDuplicada(ex: Executor, campo: CampoOpcao, valor: string, ignorarId?: string) {
  const [dup] = await ex
    .select()
    .from(opcoesCadastro)
    .where(and(eq(opcoesCadastro.campo, campo), mesmoValor(valor), ignorarId ? ne(opcoesCadastro.id, ignorarId) : undefined))
    .limit(1)
  return dup
}

function erroDuplicada(dup: Linha) {
  const campo = TITULO_CAMPO[dup.campo]
  return dup.ativo
    ? erroConflito(`Já existe a opção “${dup.valor}” em ${campo}.`, { id: dup.id, ativo: true })
    : erroConflito(`Existe a opção inativa “${dup.valor}” em ${campo}. Reative-a em vez de criar outra.`, {
        id: dup.id,
        ativo: false,
      })
}

/** Le a opcao travando a linha ate o fim da transacao. */
async function travar(ex: Executor, id: string): Promise<Linha> {
  const [linha] = await ex.select().from(opcoesCadastro).where(eq(opcoesCadastro.id, id)).for('update')
  if (!linha) throw erroNaoEncontrado('Opção não encontrada.')
  return linha
}

export async function listarOpcoes(
  usuario: UsuarioSessao,
  filtro: { campo?: CampoOpcao; incluirInativas?: boolean } = {},
): Promise<Partial<OpcoesPorCampo>> {
  // Inativas so interessam a quem administra; para os demais, o pedido e ignorado.
  const incluirInativas = filtro.incluirInativas === true && ehAdmin(usuario)

  const linhas = await db
    .select()
    .from(opcoesCadastro)
    .where(
      and(
        filtro.campo ? eq(opcoesCadastro.campo, filtro.campo) : undefined,
        incluirInativas ? undefined : eq(opcoesCadastro.ativo, true),
      ),
    )
    .orderBy(asc(opcoesCadastro.ordem), sql`lower(f_unaccent(${opcoesCadastro.valor}))`)

  // Para quem administra: quantos contratos usam cada opcao (ajuda a decidir
  // entre renomear -- vale para todos -- e desativar).
  const usos = ehAdmin(usuario) ? await contarUsos() : null

  const campos = filtro.campo ? [filtro.campo] : CAMPOS_OPCAO
  const resultado: Partial<OpcoesPorCampo> = Object.fromEntries(campos.map((c) => [c, [] as Opcao[]]))
  for (const l of linhas) resultado[l.campo]!.push(usos ? { ...paraOpcao(l), emUso: usos.get(l.id) ?? 0 } : paraOpcao(l))
  return resultado
}

async function contarUsos(): Promise<Map<string, number>> {
  const linhas = await db.execute<{ id: string; n: number }>(sql`
    select id, count(*)::int as n from (
      select ${contratos.categoriaId} as id from ${contratos}
      union all select ${contratos.segmentoId} from ${contratos}
      union all select ${contratos.empresaId} from ${contratos}
      union all select ${contratos.filialId} from ${contratos}
      union all select ${contratos.areaResponsavelId} from ${contratos}
      union all select ${contratos.centroCustoId} from ${contratos}
    ) usos group by id`)
  return new Map(linhas.map((l) => [l.id, l.n]))
}

export async function criarOpcao(usuario: UsuarioSessao, entrada: DadosCriarOpcao, contexto: ContextoAuditoria): Promise<Opcao> {
  exigirAdmin(usuario)
  // O esquema zod ja apara; repetido aqui para a regra valer mesmo chamada fora da rota.
  const dados = { ...entrada, valor: entrada.valor.trim() }
  try {
    return await db.transaction(async (tx) => {
      const dup = await buscarDuplicada(tx, dados.campo, dados.valor)
      if (dup) throw erroDuplicada(dup)

      // Entra no fim da lista do campo.
      const [{ ultima }] = await tx
        .select({ ultima: max(opcoesCadastro.ordem) })
        .from(opcoesCadastro)
        .where(eq(opcoesCadastro.campo, dados.campo))

      const [nova] = await tx
        .insert(opcoesCadastro)
        .values({ campo: dados.campo, valor: dados.valor, ordem: (ultima ?? 0) + 1 })
        .returning()

      await registrarAuditoria(
        tx,
        {
          usuario,
          categoria: 'configuracao',
          acao: 'opcao.criada',
          descricao: `Criou a opção “${nova.valor}” em ${TITULO_CAMPO[nova.campo]}`,
          dados: { id: nova.id, campo: nova.campo, valor: nova.valor },
        },
        contexto,
      )
      return paraOpcao(nova)
    })
  } catch (erro) {
    // Duas criacoes simultaneas do mesmo valor: a segunda esbarra no indice unico.
    if (ehViolacaoUnica(erro, UNICA)) {
      const dup = await buscarDuplicada(db, dados.campo, dados.valor)
      if (dup) throw erroDuplicada(dup)
    }
    throw erro
  }
}

export async function editarOpcao(
  usuario: UsuarioSessao,
  id: string,
  entrada: DadosEditarOpcao,
  contexto: ContextoAuditoria,
): Promise<Opcao> {
  exigirAdmin(usuario)
  if (entrada.valor !== undefined) entrada = { ...entrada, valor: entrada.valor.trim() }
  const dados = entrada
  try {
    return await db.transaction(async (tx) => {
      const atual = await travar(tx, id)
      if (atual.versao !== dados.versao) {
        throw erroConflito('Esta opção foi alterada por outra pessoa. Recarregue a página e tente de novo.')
      }

      const novoValor = dados.valor !== undefined && dados.valor !== atual.valor ? dados.valor : undefined
      const novaOrdem = dados.ordem !== undefined && dados.ordem !== atual.ordem ? dados.ordem : undefined
      if (novoValor === undefined && novaOrdem === undefined) return paraOpcao(atual)

      if (novoValor !== undefined) {
        // Corrigir so acento/maiuscula da propria opcao e permitido.
        const dup = await buscarDuplicada(tx, atual.campo, novoValor, atual.id)
        if (dup) throw erroDuplicada(dup)
      }

      const [editada] = await tx
        .update(opcoesCadastro)
        .set({
          ...(novoValor !== undefined ? { valor: novoValor } : {}),
          ...(novaOrdem !== undefined ? { ordem: novaOrdem } : {}),
          versao: atual.versao + 1,
          atualizadoEm: new Date(),
        })
        .where(eq(opcoesCadastro.id, id))
        .returning()

      const campo = TITULO_CAMPO[atual.campo]
      await registrarAuditoria(
        tx,
        novoValor !== undefined
          ? {
              usuario,
              categoria: 'configuracao',
              acao: 'opcao.renomeada',
              descricao: `Renomeou ${campo.toLowerCase()}: ${atual.valor} → ${novoValor}`,
              dados: { id, valor: { de: atual.valor, para: novoValor }, ...(novaOrdem !== undefined ? { ordem: { de: atual.ordem, para: novaOrdem } } : {}) },
            }
          : {
              usuario,
              categoria: 'configuracao',
              acao: 'opcao.reordenada',
              descricao: `Mudou a posição de “${atual.valor}” em ${campo}`,
              dados: { id, ordem: { de: atual.ordem, para: novaOrdem } },
            },
        contexto,
      )
      return paraOpcao(editada)
    })
  } catch (erro) {
    if (ehViolacaoUnica(erro, UNICA) && dados.valor !== undefined) {
      throw erroConflito('Já existe uma opção com esse valor neste campo.')
    }
    throw erro
  }
}

export async function desativarOpcao(usuario: UsuarioSessao, id: string, contexto: ContextoAuditoria): Promise<Opcao> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const atual = await travar(tx, id)
    if (!atual.ativo) return paraOpcao(atual) // ja inativa: nada a fazer

    // Trava as ativas do campo: duas desativacoes simultaneas nao podem, juntas,
    // zerar o campo (cada uma veria a outra ainda ativa).
    const ativas = await tx
      .select({ id: opcoesCadastro.id })
      .from(opcoesCadastro)
      .where(and(eq(opcoesCadastro.campo, atual.campo), eq(opcoesCadastro.ativo, true)))
      .for('update')
    if (ativas.length <= 1) {
      throw erroRegraNegocio(
        `“${atual.valor}” é a última opção ativa de ${TITULO_CAMPO[atual.campo]}. ` +
          'O cadastro de contrato exige ao menos uma; crie outra antes de desativar esta.',
      )
    }

    const [desativada] = await tx
      .update(opcoesCadastro)
      .set({ ativo: false, versao: atual.versao + 1, atualizadoEm: new Date() })
      .where(eq(opcoesCadastro.id, id))
      .returning()

    await registrarAuditoria(
      tx,
      {
        usuario,
        categoria: 'configuracao',
        acao: 'opcao.desativada',
        descricao: `Desativou a opção “${atual.valor}” em ${TITULO_CAMPO[atual.campo]}`,
        dados: { id },
      },
      contexto,
    )
    return paraOpcao(desativada)
  })
}

export async function reativarOpcao(usuario: UsuarioSessao, id: string, contexto: ContextoAuditoria): Promise<Opcao> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const atual = await travar(tx, id)
    if (atual.ativo) return paraOpcao(atual)

    const [reativada] = await tx
      .update(opcoesCadastro)
      .set({ ativo: true, versao: atual.versao + 1, atualizadoEm: new Date() })
      .where(eq(opcoesCadastro.id, id))
      .returning()

    await registrarAuditoria(
      tx,
      {
        usuario,
        categoria: 'configuracao',
        acao: 'opcao.reativada',
        descricao: `Reativou a opção “${atual.valor}” em ${TITULO_CAMPO[atual.campo]}`,
        dados: { id },
      },
      contexto,
    )
    return paraOpcao(reativada)
  })
}
