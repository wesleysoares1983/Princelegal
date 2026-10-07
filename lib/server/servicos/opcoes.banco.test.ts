import { and, desc, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'
import { db, fecharBanco } from '../db/cliente'
import { auditoria, opcoesCadastro } from '../db/esquema'
import { ErroApi } from '../http/erros'
import { criarOpcao, desativarOpcao, editarOpcao, listarOpcoes, reativarOpcao } from './opcoes'

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: '1', nome: 'Ana Admin', email: 'ana@x', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const COMUM: UsuarioSessao = { matricula: '2', nome: 'João', email: 'joao@x', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const CTX = { ip: '10.0.0.1', userAgent: 'vitest' }

/** Espera um ErroApi com esse codigo; devolve-o para inspecao. */
async function falha(promessa: Promise<unknown>, codigo: string): Promise<ErroApi> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(ErroApi)
  expect((erro as ErroApi).codigo).toBe(codigo)
  return erro as ErroApi
}

async function ultimaAuditoria() {
  const [linha] = await db.select().from(auditoria).orderBy(desc(auditoria.id)).limit(1)
  return linha
}

describe('listarOpcoes', () => {
  it('devolve todos os campos, em ordem, só ativas para usuário comum', async () => {
    const r = await listarOpcoes(COMUM)
    expect(Object.keys(r).sort()).toEqual(['area-responsavel', 'categoria', 'centro-custo', 'empresa', 'filial', 'segmento'])
    expect(r.categoria!.map((o) => o.valor).slice(0, 3)).toEqual(['Aluguel', 'Água', 'Energia'])
  })

  it('inativas: só para admin; o pedido de um usuário comum é ignorado', async () => {
    const nova = await criarOpcao(ADMIN, { campo: 'centro-custo', valor: 'CC-9001' }, CTX)
    await desativarOpcao(ADMIN, nova.id, CTX)

    const doAdmin = await listarOpcoes(ADMIN, { campo: 'centro-custo', incluirInativas: true })
    expect(doAdmin['centro-custo']!.find((o) => o.id === nova.id)?.ativo).toBe(false)

    const doComum = await listarOpcoes(COMUM, { campo: 'centro-custo', incluirInativas: true })
    expect(doComum['centro-custo']!.some((o) => o.id === nova.id)).toBe(false)
    expect(Object.keys(doComum)).toEqual(['centro-custo'])
  })
})

describe('criarOpcao', () => {
  it('só admin', async () => {
    await falha(criarOpcao(COMUM, { campo: 'categoria', valor: 'Nova' }, CTX), 'SEM_PERMISSAO')
  })

  it('entra no fim da lista do campo e fica na auditoria com carimbo e origem', async () => {
    const antes = await listarOpcoes(ADMIN, { campo: 'empresa' })
    const maiorOrdem = Math.max(...antes.empresa!.map((o) => o.ordem))
    const nova = await criarOpcao(ADMIN, { campo: 'empresa', valor: 'Expresso Teste' }, CTX)
    expect(nova).toMatchObject({ campo: 'empresa', valor: 'Expresso Teste', ativo: true, ordem: maiorOrdem + 1, versao: 1 })

    expect(await ultimaAuditoria()).toMatchObject({
      acao: 'opcao.criada',
      categoria: 'configuracao',
      usuarioMatricula: '1',
      usuarioNome: 'Ana Admin',
      descricao: 'Criou a opção “Expresso Teste” em Empresa',
      ip: '10.0.0.1',
    })
  })

  it('duplicada sem diferenciar acento/maiúscula -> 409', async () => {
    const e = await falha(criarOpcao(ADMIN, { campo: 'categoria', valor: '  AGUA ' }, CTX), 'CONFLITO')
    expect(e.message).toContain('Já existe a opção “Água”')
  })

  it('igual a uma inativa -> 409 com o id, para a tela oferecer reativar', async () => {
    const velha = await criarOpcao(ADMIN, { campo: 'segmento', valor: 'Fretamento' }, CTX)
    await desativarOpcao(ADMIN, velha.id, CTX)
    const e = await falha(criarOpcao(ADMIN, { campo: 'segmento', valor: 'fretamento' }, CTX), 'CONFLITO')
    expect(e.extras.detalhes).toEqual({ id: velha.id, ativo: false })
  })
})

describe('editarOpcao', () => {
  it('renomeia, sobe a versão e audita de -> para', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'area-responsavel', valor: 'Compras' }, CTX)
    const r = await editarOpcao(ADMIN, o.id, { versao: 1, valor: 'Suprimentos' }, CTX)
    expect(r).toMatchObject({ valor: 'Suprimentos', versao: 2 })
    expect(await ultimaAuditoria()).toMatchObject({
      acao: 'opcao.renomeada',
      descricao: 'Renomeou área responsável: Compras → Suprimentos',
      dados: { id: o.id, valor: { de: 'Compras', para: 'Suprimentos' } },
    })
  })

  it('versão desatualizada -> 409 (duas pessoas editando)', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'area-responsavel', valor: 'Logística' }, CTX)
    await editarOpcao(ADMIN, o.id, { versao: 1, valor: 'Logística Sul' }, CTX)
    await falha(editarOpcao(ADMIN, o.id, { versao: 1, valor: 'Logística Norte' }, CTX), 'CONFLITO')
  })

  it('corrigir só acento/maiúscula da própria opção é permitido', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'filial', valor: 'ponta grossa' }, CTX)
    expect((await editarOpcao(ADMIN, o.id, { versao: 1, valor: 'Ponta Grossa' }, CTX)).valor).toBe('Ponta Grossa')
  })

  it('renomear para o valor de outra opção -> 409', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'filial', valor: 'Guarapuava' }, CTX)
    await falha(editarOpcao(ADMIN, o.id, { versao: 1, valor: 'MATRIZ' }, CTX), 'CONFLITO')
  })

  it('reordenar audita como reordenada; sem mudança real não grava nada', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'categoria', valor: 'Transporte' }, CTX)
    const r = await editarOpcao(ADMIN, o.id, { versao: 1, ordem: 0 }, CTX)
    expect(r).toMatchObject({ ordem: 0, versao: 2 })
    expect((await ultimaAuditoria()).acao).toBe('opcao.reordenada')

    const idAntes = (await ultimaAuditoria()).id
    const igual = await editarOpcao(ADMIN, o.id, { versao: 2, ordem: 0 }, CTX)
    expect(igual.versao).toBe(2)
    expect((await ultimaAuditoria()).id).toBe(idAntes)
  })

  it('id inexistente -> 404; usuário comum -> 403', async () => {
    await falha(editarOpcao(ADMIN, '00000000-0000-4000-8000-000000000000', { versao: 1, valor: 'x' }, CTX), 'NAO_ENCONTRADO')
    const [qualquer] = await db.select().from(opcoesCadastro).limit(1)
    await falha(editarOpcao(COMUM, qualquer.id, { versao: qualquer.versao, valor: 'x' }, CTX), 'SEM_PERMISSAO')
  })
})

describe('desativar / reativar', () => {
  it('a última opção ativa de um campo não pode ser desativada', async () => {
    // Deixa "empresa" com uma ativa só.
    const ativas = (await listarOpcoes(ADMIN, { campo: 'empresa' })).empresa!
    for (const o of ativas.slice(1)) await desativarOpcao(ADMIN, o.id, CTX)

    const e = await falha(desativarOpcao(ADMIN, ativas[0].id, CTX), 'REGRA_NEGOCIO')
    expect(e.message).toContain('última opção ativa de Empresa')
    const [ainda] = await db.select().from(opcoesCadastro).where(eq(opcoesCadastro.id, ativas[0].id))
    expect(ainda.ativo).toBe(true)
  })

  it('desativações simultâneas não zeram o campo', async () => {
    // "segmento": garante exatamente duas ativas e tenta desativar as duas ao mesmo tempo.
    const ativas = (await listarOpcoes(ADMIN, { campo: 'segmento' })).segmento!
    for (const o of ativas.slice(2)) await desativarOpcao(ADMIN, o.id, CTX)
    const [a, b] = ativas
    const resultados = await Promise.allSettled([desativarOpcao(ADMIN, a.id, CTX), desativarOpcao(ADMIN, b.id, CTX)])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const restantes = await db
      .select()
      .from(opcoesCadastro)
      .where(and(eq(opcoesCadastro.campo, 'segmento'), eq(opcoesCadastro.ativo, true)))
    expect(restantes).toHaveLength(1)
  })

  it('reativar volta a listar para todos e audita; repetir não faz nada', async () => {
    const o = await criarOpcao(ADMIN, { campo: 'categoria', valor: 'Manutenção' }, CTX)
    await desativarOpcao(ADMIN, o.id, CTX)
    expect((await ultimaAuditoria()).acao).toBe('opcao.desativada')

    const r = await reativarOpcao(ADMIN, o.id, CTX)
    expect(r.ativo).toBe(true)
    expect((await ultimaAuditoria()).acao).toBe('opcao.reativada')
    expect((await listarOpcoes(COMUM, { campo: 'categoria' })).categoria!.some((x) => x.id === o.id)).toBe(true)

    const idAntes = (await ultimaAuditoria()).id
    expect((await reativarOpcao(ADMIN, o.id, CTX)).versao).toBe(r.versao)
    expect((await ultimaAuditoria()).id).toBe(idAntes)
  })

  it('usuário comum não desativa nem reativa', async () => {
    const [qualquer] = await db.select().from(opcoesCadastro).limit(1)
    await falha(desativarOpcao(COMUM, qualquer.id, CTX), 'SEM_PERMISSAO')
    await falha(reativarOpcao(COMUM, qualquer.id, CTX), 'SEM_PERMISSAO')
  })
})
