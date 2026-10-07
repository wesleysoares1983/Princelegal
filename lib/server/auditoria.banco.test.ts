import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { registrarAuditoria } from './auditoria'
import { db, fecharBanco, sqlCru } from './db/cliente'
import { auditoria } from './db/esquema'

afterAll(fecharBanco)

const ANA = { matricula: '100', nome: 'Ana Ribeiro' }

describe('auditoria', () => {
  it('grava o carimbo de quem fez, a origem e os dados', async () => {
    await registrarAuditoria(
      db,
      { usuario: ANA, categoria: 'configuracao', acao: 'teste.gravar', descricao: 'Gravou', dados: { de: 'a', para: 'b' } },
      { ip: '10.0.0.5', userAgent: 'vitest' },
    )
    const [linha] = await db.select().from(auditoria).where(eq(auditoria.acao, 'teste.gravar'))
    expect(linha).toMatchObject({
      usuarioMatricula: '100',
      usuarioNome: 'Ana Ribeiro',
      categoria: 'configuracao',
      dados: { de: 'a', para: 'b' },
      ip: '10.0.0.5',
      userAgent: 'vitest',
    })
    expect(linha.ocorridoEm).toBeInstanceOf(Date)
  })

  it('sem usuário = Sistema (carimbo vazio)', async () => {
    await registrarAuditoria(db, { usuario: null, categoria: 'sistema', acao: 'teste.sistema', descricao: 'Job' })
    const [linha] = await db.select().from(auditoria).where(eq(auditoria.acao, 'teste.sistema'))
    expect(linha.usuarioMatricula).toBeNull()
  })

  it('some junto se a transação da mudança falhar', async () => {
    await expect(
      db.transaction(async (tx) => {
        await registrarAuditoria(tx, { usuario: ANA, categoria: 'configuracao', acao: 'teste.rollback', descricao: 'x' })
        throw new Error('mudança falhou')
      }),
    ).rejects.toThrow('mudança falhou')
    expect(await db.select().from(auditoria).where(eq(auditoria.acao, 'teste.rollback'))).toHaveLength(0)
  })

  it.each([
    ['UPDATE', `update auditoria set descricao = 'adulterado'`],
    ['DELETE', 'delete from auditoria'],
    ['TRUNCATE', 'truncate auditoria'],
  ])('recusa %s (somente inserção)', async (_op, comando) => {
    await expect(sqlCru().unsafe(comando)).rejects.toThrow(/somente inserção/)
  })
})
