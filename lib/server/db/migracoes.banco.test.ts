import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { db, fecharBanco, sqlCru } from './cliente'
import { ehViolacaoUnica } from './erros'
import { opcoesCadastro } from './esquema'

afterAll(fecharBanco)

describe('migrações', () => {
  it('instalam as extensões e a f_unaccent imutável', async () => {
    const ext = await sqlCru()`select extname from pg_extension where extname in ('unaccent', 'pg_trgm') order by 1`
    expect(ext.map((e) => e.extname)).toEqual(['pg_trgm', 'unaccent'])
    const [r] = await sqlCru()`select f_unaccent('Água Condomínio Operações') as v`
    expect(r.v).toBe('Agua Condominio Operacoes')
  })

  it('trazem as opções de cadastro iniciais do protótipo', async () => {
    // Confere presença, não contagem: outros arquivos de teste criam opções no mesmo banco.
    const linhas = await db.select({ campo: opcoesCadastro.campo, valor: opcoesCadastro.valor }).from(opcoesCadastro)
    const por = (campo: string) => linhas.filter((l) => l.campo === campo).map((l) => l.valor)
    expect(por('categoria')).toEqual(expect.arrayContaining(['Aluguel', 'Água', 'Energia', 'Condomínio', 'Telecom', 'Licença', 'Seguro', 'Prestação de Serviço', 'Jurídico', 'Outros']))
    expect(por('segmento')).toEqual(expect.arrayContaining(['Passagens e Encomendas', 'Prinex']))
    expect(por('empresa')).toEqual(expect.arrayContaining(['Princesa dos Campos', 'Paraná']))
    expect(por('filial')).toEqual(expect.arrayContaining(['Matriz', 'Curitiba']))
    expect(por('centro-custo')).toEqual(expect.arrayContaining(['CC-1002', 'CC-2001', 'CC-3005']))
    expect(por('area-responsavel')).toEqual(expect.arrayContaining(['Administrativo', 'TI', 'Operações', 'RH', 'Financeiro', 'Jurídico']))
  })

  it('opção é única por campo sem diferenciar acento nem maiúscula', async () => {
    const erro = await db.insert(opcoesCadastro).values({ campo: 'categoria', valor: 'AGUA' }).catch((e: unknown) => e)
    expect(ehViolacaoUnica(erro, 'opcoes_cadastro_campo_valor_unico')).toBe(true)
  })

  it('o mesmo valor pode existir em campos diferentes', async () => {
    await db.insert(opcoesCadastro).values({ campo: 'segmento', valor: 'Jurídico' })
    const r = await db
      .select()
      .from(opcoesCadastro)
      .where(and(eq(opcoesCadastro.campo, 'segmento'), eq(opcoesCadastro.valor, 'Jurídico')))
    expect(r).toHaveLength(1)
  })
})
