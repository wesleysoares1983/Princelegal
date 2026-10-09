import { sql, type SQL } from 'drizzle-orm'
import type { UsuarioSessao } from '@/lib/usuario'
import { contratos } from '../esquema'

/**
 * Pedacos de SQL reaproveitados nas consultas de contratos.
 *
 * `sqlStatus` e o espelho, em SQL, de `avaliar()` (lib/shared/status.ts):
 * existe para filtrar, contar e ordenar no banco. As duas regras precisam
 * andar juntas -- o teste de paridade (contratos.banco.test.ts) cruza os limites.
 *
 * `hoje` entra sempre como parametro (data de Brasilia, calculada pelo app):
 * nada aqui depende do fuso do servidor do banco.
 */

const hojeSql = (hoje: string) => sql`${hoje}::date`

/** Dias ate o fim da vigencia (date - date = inteiro). */
export const sqlDiasVencimento = (hoje: string): SQL<number> => sql<number>`(${contratos.dataFim} - ${hojeSql(hoje)})`

export function sqlStatus(hoje: string): SQL<string> {
  const dias = sqlDiasVencimento(hoje)
  return sql<string>`(case
    when ${contratos.motivoEncerramento} = 'renovado' then 'renovado'
    when ${contratos.encerradoEm} is not null then 'encerrado'
    when ${dias} < 0 then 'vencido'
    when ${dias} <= 30 then 'alerta'
    when ${dias} <= 90 then 'atencao'
    else 'vigente'
  end)`
}

/** Prazo-limite de manifestacao a 30 dias ou menos, em contrato aberto e ainda vigente. */
export function sqlDecisaoUrgente(hoje: string): SQL<boolean> {
  const dias = sqlDiasVencimento(hoje)
  return sql<boolean>`(${contratos.encerradoEm} is null and ${dias} > 0 and ${dias} - ${contratos.prazoAvisoCancelamentoDias} <= 30)`
}

/**
 * Contratos que o usuario pode ver (§5.4–5.5): todos os nao restritos; os
 * restritos so para admin ou para quem tem o e-mail de gestor/juridico.
 */
export function sqlVisivel(usuario: UsuarioSessao): SQL<boolean> {
  if (usuario.nivel === 'admin') return sql<boolean>`true`
  const email = usuario.email.trim().toLowerCase()
  return sql<boolean>`(not ${contratos.acessoRestrito} or ${contratos.gestorEmail} = ${email} or ${contratos.responsavelJuridicoEmail} = ${email})`
}

/** Mesma expressao do indice contratos_busca_trgm (migracao 0004). */
export const textoBusca = sql`lower(f_unaccent(${contratos.nome} || ' ' || ${contratos.codigo} || ' ' || ${contratos.fornecedorNome} || ' ' || ${contratos.gestorNome} || ' ' || ${contratos.responsavelJuridicoNome}))`

/** Termo de busca no mesmo formato (sem acento, minusculo), com % escapado. */
export function padraoBusca(termo: string): SQL {
  const escapado = termo.replace(/[\\%_]/g, (c) => `\\${c}`)
  return sql`'%' || lower(f_unaccent(${escapado})) || '%'`
}
