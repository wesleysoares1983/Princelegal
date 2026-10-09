import 'server-only'
import { aliasedTable, and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { ContratoResumo, EventoAuditoria, FiltroAuditoria, Paginado, Painel } from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import type { UsuarioSessao } from '@/lib/usuario'
import { ehAdmin } from '../auth'
import { db } from '../db/cliente'
import { padraoBusca, sqlDecisaoUrgente, sqlStatus, sqlVisivel } from '../db/consultas/contratos'
import { auditoria, contratos, opcoesCadastro } from '../db/esquema'
import { paraEvento, paraResumo } from './contratos'

/**
 * Visoes agregadas: Inicio (painel), fila de Alertas e Auditoria geral.
 * Tudo filtrado pela visibilidade do usuario -- contrato restrito que ele nao
 * ve nao entra em lista nem em contagem (§5.5).
 */

const categoria = aliasedTable(opcoesCadastro, 'categoria')
const area = aliasedTable(opcoesCadastro, 'area')
const sucessor = aliasedTable(contratos, 'sucessor')

function resumos(onde: SQL | undefined) {
  return db
    .select({ c: contratos, categoria: categoria.valor, area: area.valor, sucessorCodigo: sucessor.codigo })
    .from(contratos)
    .innerJoin(categoria, eq(categoria.id, contratos.categoriaId))
    .innerJoin(area, eq(area.id, contratos.areaResponsavelId))
    .leftJoin(sucessor, eq(sucessor.id, contratos.renovadoPorContratoId))
    .where(onde)
}

/** GET /api/v1/painel -- as mesmas definicoes que a tela de Inicio ja usava. */
export async function painel(usuario: UsuarioSessao, hoje: string = hojeSP()): Promise<Painel> {
  const visivel = sqlVisivel(usuario)
  const status = sqlStatus(hoje)
  const aberto = isNull(contratos.encerradoEm)

  const [[contagens], urgentes, proximos] = await Promise.all([
    db
      .select({
        ativos: sql<number>`count(*) filter (where ${aberto})::int`,
        vence90: sql<number>`count(*) filter (where ${status} = 'atencao')::int`,
        vence30: sql<number>`count(*) filter (where ${status} = 'alerta')::int`,
        vencidos: sql<number>`count(*) filter (where ${status} = 'vencido')::int`,
        renovacaoAutomatica: sql<number>`count(*) filter (where ${aberto} and ${contratos.renovacaoAutomatica})::int`,
        decisaoUrgente: sql<number>`count(*) filter (where ${sqlDecisaoUrgente(hoje)})::int`,
        valorAnualAtivos: sql<string>`coalesce(sum(${contratos.valorMensal} * 12) filter (where ${aberto}), 0)::text`,
      })
      .from(contratos)
      .where(visivel),
    resumos(and(visivel, sqlDecisaoUrgente(hoje)))
      .orderBy(asc(contratos.dataFim))
      .limit(20),
    resumos(and(visivel, aberto))
      .orderBy(asc(contratos.dataFim), asc(contratos.codigo))
      .limit(10),
  ])

  const { valorAnualAtivos, ...resto } = contagens
  return {
    contagens: resto,
    valorAnualAtivos: Number(valorAnualAtivos),
    decisoesUrgentes: urgentes.map((r) => paraResumo(r, hoje)),
    proximosVencimentos: proximos.map((r) => paraResumo(r, hoje)),
  }
}

/** Item da fila de Alertas; `ultimoAlertaEnviado` chega com os e-mails (M6). */
export type ItemAlerta = ContratoResumo & {
  ultimoAlertaEnviado: { tipo: string; limiarDias: number; enviadoEm: string } | null
}

/** GET /api/v1/alertas -- vencidos, vencimento iminente e prazo de decisao, do mais urgente. */
export async function filaAlertas(usuario: UsuarioSessao, hoje: string = hojeSP()): Promise<{ itens: ItemAlerta[] }> {
  const status = sqlStatus(hoje)
  const linhas = await resumos(
    and(
      sqlVisivel(usuario),
      isNull(contratos.encerradoEm),
      or(sql`${status} in ('vencido', 'alerta')`, sqlDecisaoUrgente(hoje)),
    ),
  ).orderBy(asc(contratos.dataFim), asc(contratos.codigo))
  return { itens: linhas.map((r) => ({ ...paraResumo(r, hoje), ultimoAlertaEnviado: null })) }
}

/** Categorias que nao-admin ve na auditoria geral (eventos de contrato que ele pode ver). */
const CATEGORIAS_DE_CONTRATO = ['contrato', 'documento', 'obrigacao'] as const

/** Limites do dia em Brasilia, como instantes. */
const inicioDoDia = (d: string) => sql`(${d}::date)::timestamp at time zone 'America/Sao_Paulo'`
const fimDoDia = (d: string) => sql`((${d}::date + 1))::timestamp at time zone 'America/Sao_Paulo'`

export async function listarAuditoria(
  usuario: UsuarioSessao,
  f: FiltroAuditoria,
): Promise<Paginado<EventoAuditoria> & { facetas: { usuarios: { matricula: string; nome: string }[] } }> {
  const admin = ehAdmin(usuario)

  // Visibilidade (vale tambem para as facetas).
  const visibilidade: SQL[] = admin
    ? f.incluirAcessos
      ? []
      : [sql`${auditoria.categoria} <> 'acesso'`]
    : [inArray(auditoria.categoria, [...CATEGORIAS_DE_CONTRATO]), sql`${auditoria.contratoId} is not null`, sqlVisivel(usuario)]

  const filtros: SQL[] = []
  if (f.busca) {
    const padrao = padraoBusca(f.busca)
    filtros.push(
      sql`lower(f_unaccent(${auditoria.descricao} || ' ' || coalesce(${contratos.nome}, '') || ' ' || coalesce(${contratos.codigo}, ''))) like ${padrao}`,
    )
  }
  if (f.usuario === 'sistema') filtros.push(isNull(auditoria.usuarioMatricula))
  else if (f.usuario) filtros.push(eq(auditoria.usuarioMatricula, f.usuario))
  if (f.contratoId) filtros.push(eq(auditoria.contratoId, f.contratoId))
  if (f.categoria) filtros.push(eq(auditoria.categoria, f.categoria))
  if (f.de) filtros.push(sql`${auditoria.ocorridoEm} >= ${inicioDoDia(f.de)}`)
  if (f.ate) filtros.push(sql`${auditoria.ocorridoEm} < ${fimDoDia(f.ate)}`)

  const onde = and(...visibilidade, ...filtros)
  const base = () => db.select().from(auditoria).leftJoin(contratos, eq(contratos.id, auditoria.contratoId))

  const [linhas, [{ total }], usuarios] = await Promise.all([
    base()
      .where(onde)
      .orderBy(desc(auditoria.ocorridoEm), desc(auditoria.id))
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditoria)
      .leftJoin(contratos, eq(contratos.id, auditoria.contratoId))
      .where(onde),
    db
      .select({ matricula: auditoria.usuarioMatricula, nome: sql<string>`max(${auditoria.usuarioNome})` })
      .from(auditoria)
      .leftJoin(contratos, eq(contratos.id, auditoria.contratoId))
      .where(and(...visibilidade, sql`${auditoria.usuarioMatricula} is not null`))
      .groupBy(auditoria.usuarioMatricula)
      .orderBy(sql`max(${auditoria.usuarioNome})`),
  ])

  return {
    itens: linhas.map((l) =>
      paraEvento(l.auditoria, l.contratos ? { id: l.contratos.id, codigo: l.contratos.codigo, nome: l.contratos.nome } : null),
    ),
    total,
    pagina: f.pagina,
    porPagina: f.porPagina,
    facetas: { usuarios: usuarios.map((u) => ({ matricula: u.matricula!, nome: u.nome })) },
  }
}
