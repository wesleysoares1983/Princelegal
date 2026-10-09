import { and, desc, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { esquemaCriarContrato, type DadosCriarContrato, type FiltroContratos } from '@/lib/shared/contratos'
import { somarDias } from '@/lib/shared/datas'
import { avaliar } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { db, fecharBanco } from '../db/cliente'
import { sqlDecisaoUrgente, sqlStatus } from '../db/consultas/contratos'
import { auditoria, contratos, contratoVigencias, opcoesCadastro } from '../db/esquema'
import { ErroApi } from '../http/erros'
import {
  auditoriaDoContrato,
  criarContrato,
  editarContrato,
  encerrarContrato,
  listarContratos,
  obterContrato,
  reabrirContrato,
} from './contratos'
import { listarOpcoes } from './opcoes'
import { filaAlertas, listarAuditoria, painel } from './painel'

afterAll(fecharBanco)

const HOJE = '2026-10-07'
const CTX = { ip: '10.0.0.9', userAgent: 'vitest' }

const ADMIN: UsuarioSessao = { matricula: 'A1', nome: 'Ana Admin', email: 'ana@empresa.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const GESTOR: UsuarioSessao = { matricula: 'G1', nome: 'Gil Gestor', email: 'gil@empresa.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const OUTRO: UsuarioSessao = { matricula: 'O1', nome: 'Olga Outra', email: 'olga@empresa.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }

/** Opcoes proprias deste arquivo: nao depende do estado deixado por outros testes. */
const op: Record<string, string> = {}
let opInativa = ''

beforeAll(async () => {
  const sufixo = Date.now().toString(36)
  const criar = async (campo: (typeof opcoesCadastro.$inferInsert)['campo'], valor: string, ativo = true) => {
    // ordem alta: ficam no fim das listas e nao mudam a ordem que outros testes conferem.
    const [o] = await db.insert(opcoesCadastro).values({ campo, valor: `${valor} ${sufixo}`, ativo, ordem: 9000 }).returning()
    return o.id
  }
  op.categoriaId = await criar('categoria', 'Cat')
  op.segmentoId = await criar('segmento', 'Seg')
  op.empresaId = await criar('empresa', 'Emp')
  op.filialId = await criar('filial', 'Fil')
  op.areaResponsavelId = await criar('area-responsavel', 'Área Teste')
  op.centroCustoId = await criar('centro-custo', 'CC')
  op.outraCategoria = await criar('categoria', 'Cat Dois')
  opInativa = await criar('categoria', 'Cat Inativa', false)
})

let seqDoc = 0
/** CNPJ valido e unico por chamada (evita o aviso de duplicidade entre testes). */
function cnpjUnico(): string {
  seqDoc++
  const base = `90${String(seqDoc).padStart(6, '0')}0001`
  const dv = (b: string, pesos: number[]) => {
    const r = [...b].reduce((a, c, i) => a + Number(c) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${d2}`
}

function dados(extra: Partial<Record<keyof DadosCriarContrato, unknown>> = {}): DadosCriarContrato {
  return esquemaCriarContrato.parse({
    nome: 'Locação – Unidade Curitiba',
    categoriaId: op.categoriaId,
    segmentoId: op.segmentoId,
    empresaId: op.empresaId,
    filialId: op.filialId,
    areaResponsavelId: op.areaResponsavelId,
    centroCustoId: op.centroCustoId,
    fornecedorNome: 'Imobiliária Santos & Cia',
    fornecedorDocumento: cnpjUnico(),
    objeto: 'Locação do galpão.',
    gestorNome: 'Gil Gestor',
    gestorEmail: 'Gil@Empresa.com ',
    responsavelJuridicoNome: 'Júlia Jurídico',
    responsavelJuridicoEmail: 'julia@empresa.com',
    dataInicio: '2026-01-01',
    dataFim: '2027-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 90,
    valorMensal: 25000.5,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IGP-M',
    dataBaseReajuste: '2026-01-01',
    ...extra,
  })
}

const criar = (extra: Parameters<typeof dados>[0] = {}, quem: UsuarioSessao = GESTOR) =>
  criarContrato(quem, dados(extra), CTX, HOJE)

async function falha(p: Promise<unknown>, codigo: string): Promise<ErroApi> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  )
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroApi)
  expect((e as ErroApi).codigo).toBe(codigo)
  return e as ErroApi
}

const filtro = (f: Partial<FiltroContratos> = {}): FiltroContratos => ({
  status: 'todos',
  ordenar: 'vencimento',
  pagina: 1,
  porPagina: 200,
  ...f,
})

describe('status: SQL e TypeScript dão o mesmo resultado', () => {
  it('nos limites (−1, 0, 1, 30, 31, 90, 91 dias), encerrado e decisão urgente', async () => {
    const casos = [-1, 0, 1, 30, 31, 59, 60, 61, 90, 91].map((dias) =>
      criar({ dataInicio: '2025-01-01', dataFim: somarDias(HOJE, dias), prazoAvisoCancelamentoDias: 30 }, ADMIN),
    )
    const criados = await Promise.all(casos)
    const encerrado = await criar({ dataInicio: '2025-01-01', dataFim: somarDias(HOJE, 200) }, ADMIN)
    await encerrarContrato(ADMIN, encerrado.id, { versao: 1, justificativa: 'Teste de paridade', data: '2026-09-01' }, CTX, HOJE)

    const ids = [...criados.map((c) => c.id), encerrado.id]
    const linhas = await db
      .select({ c: contratos, status: sqlStatus(HOJE), urgente: sqlDecisaoUrgente(HOJE) })
      .from(contratos)
      .where(sql`${contratos.id} in ${ids}`)
    for (const l of linhas) {
      const ts = avaliar(l.c, HOJE)
      expect({ id: l.c.id, status: l.status, urgente: l.urgente }).toEqual({ id: l.c.id, status: ts.status, urgente: ts.decisaoUrgente })
    }
    expect(new Set(linhas.map((l) => l.status))).toEqual(new Set(['vencido', 'alerta', 'atencao', 'vigente', 'encerrado']))
  })
})

describe('criarContrato', () => {
  it('gera o código pelo ano do início, cria a vigência Original e audita', async () => {
    const c = await criar({ dataInicio: '2025-03-10', dataFim: '2026-03-09' })
    expect(c.codigo).toMatch(/^CTR-2025-\d{6}$/)
    expect(c).toMatchObject({
      gestorEmail: 'gil@empresa.com', // normalizado
      valorMensal: 25000.5,
      valorAnual: 300006,
      versao: 1,
      criadoPor: { matricula: 'G1', nome: 'Gil Gestor' },
    })
    expect(c.historico).toHaveLength(1)
    expect(c.historico[0]).toMatchObject({ tipo: 'Original', dataFim: '2026-03-09', valorMensal: 25000.5 })
    const [ev] = await db.select().from(auditoria).where(and(eq(auditoria.contratoId, c.id), eq(auditoria.acao, 'contrato.criado')))
    expect(ev).toMatchObject({ usuarioMatricula: 'G1', descricao: 'Cadastrou o contrato', ip: '10.0.0.9' })
  })

  it('números do código são sequenciais e nunca repetem', async () => {
    const a = await criar()
    const b = await criar()
    expect(Number(b.codigo.slice(-6))).toBe(Number(a.codigo.slice(-6)) + 1)
  })

  it('opção inativa, de outro campo ou inexistente -> VALIDACAO no campo certo', async () => {
    let e = await falha(criar({ categoriaId: opInativa }), 'VALIDACAO')
    expect(e.extras.campos?.categoriaId).toMatch(/desativada/)
    e = await falha(criar({ categoriaId: op.segmentoId }), 'VALIDACAO')
    expect(e.extras.campos?.categoriaId).toMatch(/opção válida de Categoria/)
    e = await falha(criar({ filialId: '00000000-0000-4000-8000-000000000000' }), 'VALIDACAO')
    expect(e.extras.campos?.filialId).toBeDefined()
  })

  it('mesmo fornecedor com vigência que se cruza -> POSSIVEL_DUPLICIDADE; confirmando, cadastra', async () => {
    const doc = cnpjUnico()
    const primeiro = await criar({ fornecedorDocumento: doc })
    const e = await falha(criar({ fornecedorDocumento: doc, dataInicio: '2027-06-01', dataFim: '2028-05-31' }), 'POSSIVEL_DUPLICIDADE')
    expect((e.extras.detalhes as { contratos: { codigo: string }[] }).contratos[0].codigo).toBe(primeiro.codigo)
    const segundo = await criar({ fornecedorDocumento: doc, dataInicio: '2027-06-01', dataFim: '2028-05-31', confirmarDuplicidade: true })
    expect(segundo.codigo).not.toBe(primeiro.codigo)
    // Sem sobreposição de vigência: não é duplicidade.
    await criar({ fornecedorDocumento: doc, dataInicio: '2029-01-01', dataFim: '2029-12-31' })
  })

  it('duplicidade só considera contratos que o usuário vê (não revela restritos)', async () => {
    const doc = cnpjUnico()
    await criar({ fornecedorDocumento: doc, acessoRestrito: true }) // do Gil, restrito
    await criar({ fornecedorDocumento: doc }, OUTRO) // Olga não vê o restrito: sem aviso
  })

  it('restrito por quem não é envolvido -> REGRA_NEGOCIO citando o e-mail da sessão', async () => {
    const e = await falha(criar({ acessoRestrito: true }, OUTRO), 'REGRA_NEGOCIO')
    expect(e.message).toContain('olga@empresa.com')
    await criar({ acessoRestrito: true }, GESTOR) // envolvido: ok
    await criar({ acessoRestrito: true }, ADMIN) // admin: ok
  })
})

describe('visibilidade de contrato restrito em todos os caminhos de leitura', () => {
  let restrito: Awaited<ReturnType<typeof criar>>

  beforeAll(async () => {
    restrito = await criar({
      nome: 'Contrato Sigiloso XYZ',
      acessoRestrito: true,
      dataInicio: '2026-01-01',
      dataFim: somarDias(HOJE, 10), // entra em alertas e no painel
    })
  })

  it('lista e total: fora para quem não é envolvido; dentro para envolvido e admin', async () => {
    const busca = { busca: 'Sigiloso XYZ' }
    expect((await listarContratos(OUTRO, filtro(busca), HOJE)).total).toBe(0)
    expect((await listarContratos(GESTOR, filtro(busca), HOJE)).total).toBe(1)
    expect((await listarContratos(ADMIN, filtro(busca), HOJE)).total).toBe(1)
  })

  it('e-mail com maiúscula/espaço na sessão continua casando', async () => {
    const gestorGritando = { ...GESTOR, email: ' GIL@EMPRESA.COM ' }
    expect((await listarContratos(gestorGritando, filtro({ busca: 'Sigiloso XYZ' }), HOJE)).total).toBe(1)
    await obterContrato(gestorGritando, restrito.id, undefined, HOJE)
  })

  it('detalhe: 404 para quem não vê (nunca 403)', async () => {
    await falha(obterContrato(OUTRO, restrito.id, undefined, HOJE), 'NAO_ENCONTRADO')
  })

  it('painel e alertas não contam nem listam', async () => {
    const [doOutro, doAdmin] = await Promise.all([painel(OUTRO, HOJE), painel(ADMIN, HOJE)])
    expect(doAdmin.contagens.vence30 - doOutro.contagens.vence30).toBeGreaterThanOrEqual(1)
    expect(doOutro.proximosVencimentos.some((c) => c.id === restrito.id)).toBe(false)
    expect((await filaAlertas(OUTRO, HOJE)).itens.some((c) => c.id === restrito.id)).toBe(false)
    expect((await filaAlertas(GESTOR, HOJE)).itens.some((c) => c.id === restrito.id)).toBe(true)
  })

  it('auditoria geral e do contrato não mostram eventos dele', async () => {
    const geral = await listarAuditoria(OUTRO, { pagina: 1, porPagina: 200, contratoId: restrito.id, incluirAcessos: false })
    expect(geral.total).toBe(0)
    await falha(auditoriaDoContrato(OUTRO, restrito.id, { pagina: 1, porPagina: 10, incluirAcessos: false }), 'NAO_ENCONTRADO')
  })

  it('abrir o restrito fica na trilha (uma vez por hora)', async () => {
    await obterContrato(ADMIN, restrito.id, CTX, HOJE)
    await obterContrato(ADMIN, restrito.id, CTX, HOJE)
    const vistos = await db
      .select()
      .from(auditoria)
      .where(and(eq(auditoria.contratoId, restrito.id), eq(auditoria.acao, 'contrato.visualizado'), eq(auditoria.usuarioMatricula, 'A1')))
    expect(vistos).toHaveLength(1)
    // E não aparece no Auditoria do contrato sem pedir acessos.
    const semAcessos = await auditoriaDoContrato(ADMIN, restrito.id, { pagina: 1, porPagina: 50, incluirAcessos: false })
    expect(semAcessos.itens.some((e) => e.acao === 'contrato.visualizado')).toBe(false)
    const comAcessos = await auditoriaDoContrato(ADMIN, restrito.id, { pagina: 1, porPagina: 50, incluirAcessos: true })
    expect(comAcessos.itens.some((e) => e.acao === 'contrato.visualizado')).toBe(true)
  })
})

describe('editarContrato', () => {
  it('grava só o que mudou, sobe a versão e audita de → para legível', async () => {
    const c = await criar()
    const r = await editarContrato(
      GESTOR,
      c.id,
      { versao: 1, gestorNome: 'Maria Fernandes', prazoAvisoCancelamentoDias: 60, categoriaId: op.outraCategoria, nome: c.nome },
      CTX,
      HOJE,
    )
    expect(r).toMatchObject({ versao: 2, gestorNome: 'Maria Fernandes', prazoAvisoCancelamentoDias: 60 })
    const [ev] = await db.select().from(auditoria).where(eq(auditoria.contratoId, c.id)).orderBy(desc(auditoria.id)).limit(1)
    expect(ev.acao).toBe('contrato.editado')
    expect(ev.descricao).toContain('gestor: Gil Gestor → Maria Fernandes')
    expect(ev.descricao).toContain('prazo de aviso: 90 dias → 60 dias')
    expect(ev.descricao).toMatch(/categoria: Cat .* → Cat Dois/)
    expect(ev.descricao).not.toContain('nome:') // igual ao atual: não é mudança
    expect(ev.dados).toMatchObject({ gestorNome: { de: 'Gil Gestor', para: 'Maria Fernandes' } })
  })

  it('sem mudança real: nada gravado', async () => {
    const c = await criar()
    const r = await editarContrato(GESTOR, c.id, { versao: 1, gestorNome: 'Gil Gestor' }, CTX, HOJE)
    expect(r.versao).toBe(1)
  })

  it('versão desatualizada -> CONFLITO', async () => {
    const c = await criar()
    await editarContrato(GESTOR, c.id, { versao: 1, nome: 'Novo nome' }, CTX, HOJE)
    await falha(editarContrato(GESTOR, c.id, { versao: 1, nome: 'Outro nome' }, CTX, HOJE), 'CONFLITO')
  })

  it('opção que ficou inativa pode continuar; trocar para uma inativa, não', async () => {
    const c = await criar()
    await db.update(opcoesCadastro).set({ ativo: false }).where(eq(opcoesCadastro.id, op.centroCustoId))
    try {
      await editarContrato(GESTOR, c.id, { versao: 1, centroCustoId: op.centroCustoId, nome: 'Mantém CC inativo' }, CTX, HOJE)
      await falha(editarContrato(GESTOR, c.id, { versao: 2, categoriaId: opInativa }, CTX, HOJE), 'VALIDACAO')
    } finally {
      await db.update(opcoesCadastro).set({ ativo: true }).where(eq(opcoesCadastro.id, op.centroCustoId))
    }
  })

  it('restrição: só admin/envolvido alteram; ninguém se tranca fora', async () => {
    const c = await criar()
    await falha(editarContrato(OUTRO, c.id, { versao: 1, acessoRestrito: true }, CTX, HOJE), 'SEM_PERMISSAO')
    // Gil restringe e troca o próprio e-mail de gestor: ficaria de fora.
    await falha(
      editarContrato(GESTOR, c.id, { versao: 1, acessoRestrito: true, gestorEmail: 'outra@empresa.com' }, CTX, HOJE),
      'REGRA_NEGOCIO',
    )
    const r = await editarContrato(GESTOR, c.id, { versao: 1, acessoRestrito: true }, CTX, HOJE)
    expect(r.acessoRestrito).toBe(true)
  })

  it('ação de vencimento: exige responsável e prazo; status começa Pendente; null limpa tudo', async () => {
    const c = await criar()
    const e = await falha(editarContrato(GESTOR, c.id, { versao: 1, acaoVencimento: 'Renovar' }, CTX, HOJE), 'VALIDACAO')
    expect(Object.keys(e.extras.campos ?? {})).toEqual(['responsavelAcao', 'prazoAcao'])
    const r = await editarContrato(
      GESTOR,
      c.id,
      { versao: 1, acaoVencimento: 'Renovar', responsavelAcao: 'Wesley', prazoAcao: '2026-11-30' },
      CTX,
      HOJE,
    )
    expect(r.acaoVencimento).toEqual({ acao: 'Renovar', responsavel: 'Wesley', prazo: '2026-11-30', status: 'Pendente' })
    const limpo = await editarContrato(GESTOR, c.id, { versao: 2, acaoVencimento: null }, CTX, HOJE)
    expect(limpo.acaoVencimento).toBeNull()
  })

  it('contrato encerrado é somente leitura', async () => {
    const c = await criar()
    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim do serviço' }, CTX, HOJE)
    await falha(editarContrato(ADMIN, c.id, { versao: 2, nome: 'X' }, CTX, HOJE), 'REGRA_NEGOCIO')
  })
})

describe('encerrar / reabrir', () => {
  it('só admin; data não pode ser futura nem antes do início', async () => {
    const c = await criar()
    await falha(encerrarContrato(GESTOR, c.id, { versao: 1, justificativa: 'Fim do serviço' }, CTX, HOJE), 'SEM_PERMISSAO')
    await falha(encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim do serviço', data: '2026-10-08' }, CTX, HOJE), 'VALIDACAO')
    await falha(encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim do serviço', data: '2025-12-31' }, CTX, HOJE), 'VALIDACAO')
  })

  it('encerra com carimbo, conclui a ação de vencimento e audita; reabrir desfaz', async () => {
    const c = await criar()
    await editarContrato(GESTOR, c.id, { versao: 1, acaoVencimento: 'Encerrar', responsavelAcao: 'Gil', prazoAcao: '2026-10-30' }, CTX, HOJE)
    const e = await encerrarContrato(ADMIN, c.id, { versao: 2, justificativa: 'Serviço descontinuado' }, CTX, HOJE)
    expect(e.avaliacao.status).toBe('encerrado')
    expect(e.encerramento).toEqual({ data: HOJE, motivo: 'manual', justificativa: 'Serviço descontinuado', por: { matricula: 'A1', nome: 'Ana Admin' } })
    expect(e.acaoVencimento?.status).toBe('Concluída')
    expect(e.permissoes).toMatchObject({ editar: false, encerrar: false, reabrir: true })

    await falha(encerrarContrato(ADMIN, c.id, { versao: 3, justificativa: 'De novo' }, CTX, HOJE), 'REGRA_NEGOCIO')
    await falha(reabrirContrato(GESTOR, c.id, { versao: 3, justificativa: 'Engano' }, CTX, HOJE), 'SEM_PERMISSAO')

    const r = await reabrirContrato(ADMIN, c.id, { versao: 3, justificativa: 'Encerrado por engano' }, CTX, HOJE)
    expect(r.encerramento).toBeNull()
    expect(r.avaliacao.status).not.toBe('encerrado')
    const [ev] = await db.select().from(auditoria).where(eq(auditoria.contratoId, c.id)).orderBy(desc(auditoria.id)).limit(1)
    expect(ev).toMatchObject({ acao: 'contrato.reaberto' })
    expect(ev.descricao).toContain('Encerrado por engano')
  })

  it('reabrir contrato aberto -> REGRA_NEGOCIO', async () => {
    const c = await criar()
    await falha(reabrirContrato(ADMIN, c.id, { versao: 1, justificativa: 'Nada a reabrir' }, CTX, HOJE), 'REGRA_NEGOCIO')
  })
})

describe('listarContratos: filtros, busca e paginação', () => {
  it('busca sem acento, por trecho, por CNPJ (com ou sem pontuação) e por área', async () => {
    const doc = cnpjUnico()
    const c = await criar({ nome: 'Energia Elétrica – Galpão Ômega', fornecedorDocumento: doc })
    const achou = async (busca: string) => (await listarContratos(ADMIN, filtro({ busca }), HOJE)).itens.some((i) => i.id === c.id)
    expect(await achou('eletrica galpao omega')).toBe(true)
    expect(await achou('ÔMEGA')).toBe(true)
    expect(await achou(doc.slice(0, 8))).toBe(true)
    expect(await achou(`${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}`)).toBe(true)
    expect(await achou('area teste')).toBe(true)
    expect(await achou('nada-parecido-%')).toBe(false)
  })

  it('status e "ativos" filtram no banco', async () => {
    const vencido = await criar({ dataInicio: '2025-01-01', dataFim: somarDias(HOJE, -3) })
    const vencidos = await listarContratos(ADMIN, filtro({ status: 'vencido' }), HOJE)
    expect(vencidos.itens.every((i) => i.avaliacao.status === 'vencido')).toBe(true)
    expect(vencidos.itens.some((i) => i.id === vencido.id)).toBe(true)
    const ativos = await listarContratos(ADMIN, filtro({ status: 'ativos' }), HOJE)
    expect(ativos.itens.every((i) => i.avaliacao.status !== 'encerrado')).toBe(true)
  })

  it('paginação: total é o do filtro inteiro, itens é só a página', async () => {
    const p1 = await listarContratos(ADMIN, filtro({ porPagina: 2, pagina: 1 }), HOJE)
    const p2 = await listarContratos(ADMIN, filtro({ porPagina: 2, pagina: 2 }), HOJE)
    expect(p1.itens).toHaveLength(2)
    expect(p1.total).toBeGreaterThan(2)
    expect(p1.itens[0].id).not.toBe(p2.itens[0].id)
  })

  it('envolvido=eu traz só os do usuário', async () => {
    const meus = await listarContratos(OUTRO, filtro({ envolvido: 'eu' }), HOJE)
    expect(meus.itens.every((i) => i.gestorNome !== 'Gil Gestor')).toBe(true)
  })
})

describe('auditoria geral e opções', () => {
  it('usuário comum não vê eventos de configuração; admin vê; filtro "sistema"', async () => {
    await db.insert(auditoria).values({ categoria: 'configuracao', acao: 'teste.config', descricao: 'Config X' })
    const doOutro = await listarAuditoria(OUTRO, { pagina: 1, porPagina: 200, categoria: 'configuracao', incluirAcessos: false })
    expect(doOutro.total).toBe(0)
    const doAdmin = await listarAuditoria(ADMIN, { pagina: 1, porPagina: 200, usuario: 'sistema', incluirAcessos: false })
    expect(doAdmin.itens.some((e) => e.acao === 'teste.config' && e.usuario === null)).toBe(true)
  })

  it('admin vê quantos contratos usam cada opção', async () => {
    const r = await listarOpcoes(ADMIN, { campo: 'filial' })
    expect(r.filial!.find((o) => o.id === op.filialId)?.emUso).toBeGreaterThan(5)
    const doComum = await listarOpcoes(OUTRO, { campo: 'filial' })
    expect(doComum.filial!.every((o) => o.emUso === undefined)).toBe(true)
  })

  it('vigência Original fica gravada com carimbo', async () => {
    const c = await criar()
    const [v] = await db.select().from(contratoVigencias).where(eq(contratoVigencias.contratoId, c.id))
    expect(v).toMatchObject({ tipo: 'Original', criadoPorMatricula: 'G1', valorMensal: '25000.50' })
  })
})
