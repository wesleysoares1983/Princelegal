import { and, asc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { esquemaCriarContrato } from '@/lib/shared/contratos'
import { esquemaCriarTarefa } from '@/lib/shared/tarefas'
import type { UsuarioSessao } from '@/lib/usuario'

// Sugestões de responsável: os usuários vêm dos Apps Princesa -- aqui, uma listagem fixa.
vi.mock('../usuariosApp', () => ({
  obterUsuariosDoApp: vi.fn(async () => ({
    app: { id: 10, nome: 'Contratos', ativo: true },
    cargos: [],
    usuarios: [
      { matricula: 'U1', nome: 'Zélia Ativa', email: 'z@x.com', perfil: null, cargo: null, ativo: true, criadoEm: null },
      { matricula: 'U2', nome: 'Ivo Inativo', email: 'i@x.com', perfil: null, cargo: null, ativo: false, criadoEm: null },
    ],
  })),
}))

const { db, fecharBanco } = await import('../db/cliente')
const { auditoria, opcoesCadastro, tarefas } = await import('../db/esquema')
const { ErroApi } = await import('../http/erros')
const { auditoriaDoContrato, criarContrato, encerrarContrato } = await import('./contratos')
const { criarTarefa, listarTarefas, moverTarefa, removerTarefa } = await import('./tarefas')
const { listarAuditoria } = await import('./painel')

afterAll(fecharBanco)

const HOJE = '2026-03-15'
const CTX = { ip: '10.0.0.4', userAgent: 'vitest' }
const ADMIN: UsuarioSessao = { matricula: 'TA', nome: 'Tânia Admin', email: 'tania@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const LEITOR: UsuarioSessao = { matricula: 'TL', nome: 'Túlio Leitor', email: 'tulio@x.com', perfil: null, cargo: 'FUNCIONARIO', nivel: 'leitura' }

async function falha(p: Promise<unknown>, codigo: string) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  )
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroApi)
  expect((e as InstanceType<typeof ErroApi>).codigo).toBe(codigo)
}

const nova = (dados: Record<string, unknown> = {}) =>
  criarTarefa(ADMIN, esquemaCriarTarefa.parse({ titulo: 'Revisar minuta', coluna: 'A fazer', ...dados }), CTX, HOJE)

const eventos = (tarefaId: string) =>
  db
    .select()
    .from(auditoria)
    .where(sql`${auditoria.dados}->>'tarefaId' = ${tarefaId}`)
    .orderBy(asc(auditoria.id))

const quadro = (u: UsuarioSessao = ADMIN, limiteConcluidas = 100) => listarTarefas(u, { limiteConcluidas }, HOJE)

let base: Record<string, unknown>
let seq = 0
beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) =>
    (await db.select().from(opcoesCadastro).where(and(eq(opcoesCadastro.campo, campo), eq(opcoesCadastro.ativo, true))).limit(1))[0].id
  base = {
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Tarefas',
    fornecedorDocumento: '52998224725',
    objeto: 'Objeto',
    gestorNome: 'Gestora',
    gestorEmail: 'gestora.tar@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'jur.tar@x.com',
    dataInicio: '2026-01-01',
    dataFim: '2026-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 500,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2026-01-01',
  }
})

const novoContrato = (extra: Record<string, unknown> = {}) => {
  seq++
  return criarContrato(ADMIN, esquemaCriarContrato.parse({ ...base, nome: `Contrato tarefas ${seq}`, confirmarDuplicidade: true, ...extra }), CTX, HOJE)
}

describe('criar', () => {
  it('nasce na coluna escolhida (qualquer uma) e audita com o carimbo da sessão', async () => {
    for (const coluna of ['A fazer', 'Em andamento', 'Concluída'] as const) {
      const t = await nova({ titulo: `Nasce em ${coluna}`, coluna })
      expect(t).toMatchObject({ coluna, contrato: null, vinculoRestrito: false, criadoPor: { matricula: 'TA', nome: 'Tânia Admin' } })
      const [ev] = await eventos(t.id)
      expect(ev).toMatchObject({
        categoria: 'tarefa',
        acao: 'tarefa.criada',
        descricao: `Criou a tarefa “Nasce em ${coluna}” em “${coluna}”`,
        usuarioMatricula: 'TA',
        usuarioNome: 'Tânia Admin',
        contratoId: null,
        ip: '10.0.0.4',
      })
    }
  })

  it('campos opcionais e atrasada (prazo vencido, não concluída)', async () => {
    const t = await nova({ descricao: ' Ver cláusula 4 ', responsavel: 'Financeiro', prazo: '2026-03-14' })
    expect(t).toMatchObject({ descricao: 'Ver cláusula 4', responsavel: 'Financeiro', prazo: '2026-03-14', atrasada: true })
    expect((await nova({ prazo: '2026-03-15' })).atrasada).toBe(false)
    expect((await nova({ prazo: '2026-03-01', coluna: 'Concluída' })).atrasada).toBe(false)
  })

  it('contrato inexistente -> 404, e nada é gravado', async () => {
    const antes = (await db.select({ n: sql<number>`count(*)::int` }).from(tarefas))[0].n
    await falha(nova({ contratoId: '00000000-0000-4000-8000-000000000000' }), 'NAO_ENCONTRADO')
    expect((await db.select({ n: sql<number>`count(*)::int` }).from(tarefas))[0].n).toBe(antes)
  })
})

describe('somente leitura', () => {
  it('não cria, não move, não exclui -- e nada vai para a auditoria', async () => {
    const t = await nova()
    await falha(criarTarefa(LEITOR, esquemaCriarTarefa.parse({ titulo: 'X', coluna: 'A fazer' }), CTX, HOJE), 'SEM_PERMISSAO')
    await falha(moverTarefa(LEITOR, t.id, 'Concluída', CTX, HOJE), 'SEM_PERMISSAO')
    await falha(removerTarefa(LEITOR, t.id, 'Não quero', CTX), 'SEM_PERMISSAO')
    expect(await eventos(t.id)).toHaveLength(1)
    expect((await quadro(LEITOR)).itens.find((i) => i.id === t.id)?.coluna).toBe('A fazer')
  })
})

describe('mover', () => {
  it('qualquer coluna para qualquer coluna, inclusive voltar de Concluída', async () => {
    const t = await nova()
    expect((await moverTarefa(ADMIN, t.id, 'Concluída', CTX, HOJE)).coluna).toBe('Concluída')
    expect((await moverTarefa(ADMIN, t.id, 'A fazer', CTX, HOJE)).coluna).toBe('A fazer')
    const evs = await eventos(t.id)
    expect(evs.map((e) => e.descricao)).toEqual([
      'Criou a tarefa “Revisar minuta” em “A fazer”',
      'Moveu a tarefa “Revisar minuta” de “A fazer” para “Concluída”',
      'Moveu a tarefa “Revisar minuta” de “Concluída” para “A fazer”',
    ])
    expect(evs[1].dados).toEqual({ tarefaId: t.id, de: 'A fazer', para: 'Concluída' })
  })

  it('soltar na mesma coluna não muda nada nem audita', async () => {
    const t = await nova({ coluna: 'Em andamento' })
    const [antes] = await db.select().from(tarefas).where(eq(tarefas.id, t.id))
    expect((await moverTarefa(ADMIN, t.id, 'Em andamento', CTX, HOJE)).coluna).toBe('Em andamento')
    const [depois] = await db.select().from(tarefas).where(eq(tarefas.id, t.id))
    expect(depois.colunaDesde).toBe(antes.colunaDesde)
    expect(await eventos(t.id)).toHaveLength(1)
  })

  it('dois movendo o mesmo cartão ao mesmo tempo: a auditoria sai encadeada', async () => {
    const t = await nova()
    await Promise.all([moverTarefa(ADMIN, t.id, 'Em andamento', CTX, HOJE), moverTarefa(ADMIN, t.id, 'Concluída', CTX, HOJE)])
    const [, primeiro, segundo] = (await eventos(t.id)).map((e) => e.dados as { de: string; para: string })
    expect(primeiro.de).toBe('A fazer')
    expect(segundo.de).toBe(primeiro.para)
  })

  it('id inexistente -> 404', async () => {
    await falha(moverTarefa(ADMIN, '00000000-0000-4000-8000-000000000000', 'A fazer', CTX, HOJE), 'NAO_ENCONTRADO')
  })
})

describe('excluir', () => {
  it('sai do quadro, fica no banco com a justificativa, e a auditoria registra', async () => {
    const t = await nova({ titulo: 'Tarefa duplicada', coluna: 'Em andamento' })
    expect(await removerTarefa(ADMIN, t.id, 'Duplicada da anterior', CTX)).toBeNull()
    expect((await quadro()).itens.some((i) => i.id === t.id)).toBe(false)

    const [linha] = await db.select().from(tarefas).where(eq(tarefas.id, t.id))
    expect(linha).toMatchObject({ motivoRemocao: 'Duplicada da anterior', removidaPorMatricula: 'TA', removidaPorNome: 'Tânia Admin' })
    expect(linha.removidaEm).not.toBeNull()

    const ev = (await eventos(t.id)).at(-1)!
    expect(ev).toMatchObject({
      acao: 'tarefa.removida',
      descricao: 'Excluiu a tarefa “Tarefa duplicada” (estava em “Em andamento”). Justificativa: Duplicada da anterior',
    })
  })

  it('excluída não volta: excluir de novo ou mover -> 404', async () => {
    const t = await nova()
    await removerTarefa(ADMIN, t.id, 'Não precisa mais', CTX)
    await falha(removerTarefa(ADMIN, t.id, 'De novo', CTX), 'NAO_ENCONTRADO')
    await falha(moverTarefa(ADMIN, t.id, 'Concluída', CTX, HOJE), 'NAO_ENCONTRADO')
  })
})

describe('vínculo com contrato', () => {
  it('contrato visível: código, nome e "encerrado" quando fechado', async () => {
    const c = await novoContrato()
    const t = await nova({ contratoId: c.id })
    expect(t.contrato).toEqual({ id: c.id, codigo: c.codigo, nome: c.nome, encerrado: false })
    expect((await eventos(t.id))[0].dados).toEqual({ tarefaId: t.id, contratoId: c.id })

    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim do contrato', data: '2026-03-10' }, CTX, HOJE)
    expect((await quadro()).itens.find((i) => i.id === t.id)?.contrato?.encerrado).toBe(true)
    // Contrato encerrado ainda aceita vínculo.
    expect((await nova({ contratoId: c.id })).contrato?.encerrado).toBe(true)
  })

  it('contrato restrito: admin vincula; leitor não envolvido vê só que há vínculo restrito', async () => {
    const c = await novoContrato({ acessoRestrito: true })
    const t = await nova({ contratoId: c.id })
    expect(t.contrato?.id).toBe(c.id)

    const doLeitor = (await quadro(LEITOR)).itens.find((i) => i.id === t.id)!
    expect(doLeitor).toMatchObject({ contrato: null, vinculoRestrito: true })
    expect(JSON.stringify(doLeitor)).not.toContain(c.id)
  })

  it('eventos de tarefa não entram na auditoria do contrato vinculado', async () => {
    const c = await novoContrato()
    const t = await nova({ contratoId: c.id })
    await moverTarefa(ADMIN, t.id, 'Concluída', CTX, HOJE)
    const doContrato = await auditoriaDoContrato(ADMIN, c.id, { pagina: 1, porPagina: 50, incluirAcessos: false })
    expect(doContrato.itens.some((e) => e.categoria === 'tarefa')).toBe(false)
  })

  it('auditoria geral: leitor vê os eventos de tarefa, sem `dados`; admin recebe `dados`', async () => {
    const c = await novoContrato({ acessoRestrito: true })
    const t = await nova({ titulo: 'Tarefa do restrito', contratoId: c.id })
    const filtro = { pagina: 1, porPagina: 200, categoria: 'tarefa' as const, busca: 'Tarefa do restrito', incluirAcessos: false }

    const doLeitor = await listarAuditoria(LEITOR, filtro)
    expect(doLeitor.itens).toHaveLength(1)
    expect(doLeitor.itens[0]).toMatchObject({ acao: 'tarefa.criada', contrato: null, dados: null })
    expect(JSON.stringify(doLeitor)).not.toContain(c.id)
    expect(doLeitor.facetas.usuarios.some((u) => u.matricula === 'TA')).toBe(true)

    const doAdmin = await listarAuditoria(ADMIN, filtro)
    expect(doAdmin.itens[0].dados).toEqual({ tarefaId: t.id, contratoId: c.id })
  })
})

describe('quadro', () => {
  it('abertas por criação; concluídas da mais recente, até o limite', async () => {
    const [a, b, c] = [await nova({ titulo: 'C1' }), await nova({ titulo: 'C2' }), await nova({ titulo: 'C3' })]
    for (const t of [a, b, c]) await moverTarefa(ADMIN, t.id, 'Concluída', CTX, HOJE)

    const limitado = await quadro(ADMIN, 2)
    const concluidas = limitado.itens.filter((i) => i.coluna === 'Concluída')
    expect(concluidas.map((i) => i.id)).toEqual([c.id, b.id])
    expect(limitado.maisConcluidas).toBe(true)

    const abertas = (await quadro()).itens.filter((i) => i.coluna !== 'Concluída')
    const criacao = abertas.map((i) => i.criadoEm)
    expect(criacao).toEqual([...criacao].sort())
  })

  it('sugestões: usuários ativos do app + responsáveis já usados, sem excluídas, sem repetir', async () => {
    await nova({ responsavel: 'Área Fiscal' })
    await nova({ responsavel: 'Zélia Ativa' })
    const excluida = await nova({ responsavel: 'Nome Só Na Excluída' })
    await removerTarefa(ADMIN, excluida.id, 'Teste de sugestão', CTX)

    const { responsaveis } = (await quadro()).facetas
    expect(responsaveis).toContain('Área Fiscal')
    expect(responsaveis.filter((r) => r === 'Zélia Ativa')).toHaveLength(1)
    expect(responsaveis).not.toContain('Ivo Inativo')
    expect(responsaveis).not.toContain('Nome Só Na Excluída')
    expect(responsaveis).toEqual([...responsaveis].sort((x, y) => x.localeCompare(y, 'pt-BR')))
  })
})
