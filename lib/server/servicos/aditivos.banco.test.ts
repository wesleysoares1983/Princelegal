import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { esquemaCriarContrato, type ContratoDetalhe, type DadosCriarContrato } from '@/lib/shared/contratos'
import type { UsuarioSessao } from '@/lib/usuario'
import { db, fecharBanco } from '../db/cliente'
import { auditoria, contratos, contratoVigencias, opcoesCadastro } from '../db/esquema'
import { ErroApi } from '../http/erros'
import { validarArquivo } from '../http/upload'
import { anularAditivo, registrarAditivo, renovarContrato } from './aditivos'
import { criarContrato, editarContrato, encerrarContrato, obterContrato, reabrirContrato } from './contratos'
import { listarDocumentos } from './documentos'

afterAll(fecharBanco)

const HOJE = '2026-10-09'
const CTX = { ip: '10.0.0.4', userAgent: 'vitest' }
const ADMIN: UsuarioSessao = { matricula: 'AA', nome: 'Alba Admin', email: 'alba@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const GESTOR: UsuarioSessao = { matricula: 'AG', nome: 'Aldo Gestor', email: 'aldo@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const OUTRO: UsuarioSessao = { matricula: 'AO', nome: 'Ana Outra', email: 'ana.outra@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }

const pdf = (t: string) => validarArquivo({ name: `${t}.pdf`, bytes: new Uint8Array(Buffer.from(`%PDF-1.7\n${t}\n%%EOF`)) })

async function falha(p: Promise<unknown>, codigo: string): Promise<ErroApi> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  )
  expect(e, `esperava ${codigo}`).toBeInstanceOf(ErroApi)
  expect((e as ErroApi).codigo).toBe(codigo)
  return e as ErroApi
}

let base: Record<string, unknown>
let opcaoParaDesativar = ''
let seq = 0
beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) =>
    (await db.select().from(opcoesCadastro).where(and(eq(opcoesCadastro.campo, campo), eq(opcoesCadastro.ativo, true))).limit(1))[0].id
  const [extra] = await db.insert(opcoesCadastro).values({ campo: 'filial', valor: `Filial Aditivos ${Date.now()}`, ordem: 9000 }).returning()
  opcaoParaDesativar = extra.id
  base = {
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: extra.id,
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Aditivos',
    fornecedorDocumento: '04.368.898/0001-06',
    objeto: 'Objeto',
    gestorNome: 'Aldo Gestor',
    gestorEmail: 'aldo@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'jur.adit@x.com',
    dataInicio: '2025-01-01',
    dataFim: '2026-12-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 1000,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2025-01-01',
  }
})

function dados(extra: Record<string, unknown> = {}): DadosCriarContrato {
  seq++
  return esquemaCriarContrato.parse({ ...base, nome: `Contrato aditivos ${seq}`, confirmarDuplicidade: true, ...extra })
}
const novo = (extra: Record<string, unknown> = {}, quem = GESTOR) => criarContrato(quem, dados(extra), CTX, HOJE)

/** §6.4: o contrato reflete a ultima vigencia valida. */
async function confereInvariante(contratoId: string) {
  const [c] = await db.select().from(contratos).where(eq(contratos.id, contratoId))
  const [ultima] = await db
    .select()
    .from(contratoVigencias)
    .where(and(eq(contratoVigencias.contratoId, contratoId), isNull(contratoVigencias.anuladoEm)))
    .orderBy(desc(contratoVigencias.criadoEm), sql`${contratoVigencias.numero} desc nulls last`)
    .limit(1)
  expect({ dataFim: c.dataFim, valor: c.valorMensal }).toEqual({ dataFim: ultima.dataFim, valor: ultima.valorMensal })
  return c
}

describe('invariante §6.4: criar → aditivo → aditivo → anular → aditivo → renovar', () => {
  it('o contrato sempre reflete a última vigência válida; números de aditivo nunca se repetem', async () => {
    let c: ContratoDetalhe = await novo()
    await confereInvariante(c.id)

    c = await registrarAditivo(GESTOR, c.id, { versao: c.versao, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1100, observacao: 'Prorrogação + IPCA' }, CTX, HOJE)
    expect(c).toMatchObject({ dataFim: '2027-12-31', valorMensal: 1100, dataInicio: '2025-01-01' })
    await confereInvariante(c.id)

    c = await registrarAditivo(GESTOR, c.id, { versao: c.versao, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1250 }, CTX, HOJE)
    expect(c.valorMensal).toBe(1250)
    await confereInvariante(c.id)
    expect(c.historico.map((h) => [h.tipo, h.numero])).toEqual([['Original', null], ['Aditivo', 1], ['Aditivo', 2]])
    expect(c.historico.filter((h) => h.anulavel)).toHaveLength(0) // gestor não anula

    const doAdmin = await obterContrato(ADMIN, c.id, undefined, HOJE)
    expect(doAdmin.historico.map((h) => h.anulavel)).toEqual([false, false, true]) // só o último

    c = await anularAditivo(ADMIN, c.id, doAdmin.historico[2].id, { versao: c.versao, justificativa: 'Valor digitado errado' }, CTX, HOJE)
    expect(c).toMatchObject({ dataFim: '2027-12-31', valorMensal: 1100 })
    expect(c.historico[2]).toMatchObject({ anulado: true, justificativaAnulacao: 'Valor digitado errado', anulavel: false })
    expect(c.historico[1].anulavel).toBe(true) // agora o aditivo 1 é o último válido
    await confereInvariante(c.id)

    c = await registrarAditivo(GESTOR, c.id, { versao: c.versao, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1200 }, CTX, HOJE)
    expect(c.historico.at(-1)!.numero).toBe(3) // o 2 (anulado) não é reaproveitado
    await confereInvariante(c.id)

    const renovado = await renovarContrato(GESTOR, c.id, { versao: c.versao, dataInicio: '2028-01-01', dataFim: '2028-12-31', valorMensal: 1300 }, CTX, HOJE)
    await confereInvariante(renovado.id)
    expect(renovado.historico).toHaveLength(1)
    expect(renovado.historico[0]).toMatchObject({ tipo: 'Renovação', dataInicio: '2028-01-01', dataFim: '2028-12-31', valorMensal: 1300 })
  })
})

describe('registrarAditivo — regras', () => {
  it('sem mudança de vigência nem valor -> REGRA_NEGOCIO', async () => {
    const c = await novo()
    await falha(registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2025-01-01', dataFim: '2026-12-31', valorMensal: 1000 }, CTX, HOJE), 'REGRA_NEGOCIO')
  })

  it('não começa antes do contrato; versão velha -> CONFLITO', async () => {
    const c = await novo()
    const e = await falha(registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2024-12-31', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE), 'VALIDACAO')
    expect(e.extras.campos?.dataInicio).toBeDefined()
    await falha(registrarAditivo(GESTOR, c.id, { versao: 9, dataInicio: '2025-01-01', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE), 'CONFLITO')
  })

  it('encurtar até vencer na hora exige confirmação', async () => {
    const c = await novo()
    const e = await falha(registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2025-01-01', dataFim: '2026-06-30', valorMensal: 1000 }, CTX, HOJE), 'REGRA_NEGOCIO')
    expect(e.extras.detalhes).toEqual({ confirmar: 'confirmarEncurtamento' })
    const r = await registrarAditivo(
      GESTOR,
      c.id,
      { versao: 1, dataInicio: '2025-01-01', dataFim: '2026-06-30', valorMensal: 1000, confirmarEncurtamento: true },
      CTX,
      HOJE,
    )
    expect(r.avaliacao.status).toBe('vencido')
  })

  it('encerrado -> REGRA_NEGOCIO; restrito que não vê -> 404', async () => {
    const c = await novo()
    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Encerrado para teste' }, CTX, HOJE)
    await falha(registrarAditivo(ADMIN, c.id, { versao: 2, dataInicio: '2025-01-01', dataFim: '2027-12-31', valorMensal: 1 }, CTX, HOJE), 'REGRA_NEGOCIO')
    const r = await novo({ acessoRestrito: true })
    await falha(registrarAditivo(OUTRO, r.id, { versao: 1, dataInicio: '2025-01-01', dataFim: '2027-12-31', valorMensal: 1 }, CTX, HOJE), 'NAO_ENCONTRADO')
  })

  it('com o aditivo assinado: documento "Aditivo NN - …" ligado à vigência e na aba Documentos', async () => {
    const c = await novo()
    const r = await registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE, pdf('aditivo-assinado'))
    const v = r.historico.at(-1)!
    expect(v.documento?.nome).toBe('Aditivo 01 - aditivo-assinado.pdf')
    const docs = await listarDocumentos(GESTOR, c.id)
    expect(docs.find((d) => d.id === v.documento!.id)?.tipo).toBe('Aditivo')
  })

  it('audita de → para', async () => {
    const c = await novo()
    await registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-06-30', valorMensal: 1500 }, CTX, HOJE)
    const [ev] = await db.select().from(auditoria).where(eq(auditoria.contratoId, c.id)).orderBy(desc(auditoria.id)).limit(1)
    expect(ev.acao).toBe('aditivo.registrado')
    // toLocaleString usa espaço não separável depois de "R$".
    expect(ev.descricao.replace(/\s/g, ' ')).toBe('Registrou o Aditivo 01: vigência 31/12/2026 → 30/06/2027; valor R$ 1.000 → R$ 1.500')
  })
})

describe('anularAditivo — regras', () => {
  it('só admin; só o último válido; nunca a vigência Original', async () => {
    let c = await novo()
    c = await registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE)
    c = await registrarAditivo(GESTOR, c.id, { versao: 2, dataInicio: '2028-01-01', dataFim: '2028-12-31', valorMensal: 1000 }, CTX, HOJE)
    const [original, a1, a2] = c.historico
    await falha(anularAditivo(GESTOR, c.id, a2.id, { versao: 3, justificativa: 'Gestor tentando' }, CTX, HOJE), 'SEM_PERMISSAO')
    await falha(anularAditivo(ADMIN, c.id, a1.id, { versao: 3, justificativa: 'Não é o último' }, CTX, HOJE), 'REGRA_NEGOCIO')
    await falha(anularAditivo(ADMIN, c.id, original.id, { versao: 3, justificativa: 'Original não' }, CTX, HOJE), 'REGRA_NEGOCIO')
    await anularAditivo(ADMIN, c.id, a2.id, { versao: 3, justificativa: 'Errado' }, CTX, HOJE)
    await falha(anularAditivo(ADMIN, c.id, a2.id, { versao: 4, justificativa: 'De novo' }, CTX, HOJE), 'REGRA_NEGOCIO')
    await anularAditivo(ADMIN, c.id, a1.id, { versao: 4, justificativa: 'Também errado' }, CTX, HOJE)
    const final = await confereInvariante(c.id)
    expect(final.dataFim).toBe('2026-12-31') // voltou à Original
  })
})

describe('renovarContrato', () => {
  it('novo contrato ligado ao antigo; antigo encerrado como renovado e somente leitura', async () => {
    let antigo = await novo()
    antigo = await editarContrato(GESTOR, antigo.id, { versao: 1, acaoVencimento: 'Renovar', responsavelAcao: 'Aldo', prazoAcao: '2026-11-30' }, CTX, HOJE)
    const n = await renovarContrato(GESTOR, antigo.id, { versao: 2, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1100, nome: 'Contrato renovado 2027' }, CTX, HOJE)

    expect(n.codigo).toMatch(/^CTR-2027-\d{6}$/) // ano do novo início
    expect(n).toMatchObject({ nome: 'Contrato renovado 2027', valorMensal: 1100, gestorEmail: 'aldo@x.com', fornecedorDocumento: '04.368.898/0001-06' })
    expect(n.renova).toEqual({ id: antigo.id, codigo: antigo.codigo })

    const velho = await obterContrato(GESTOR, antigo.id, undefined, HOJE)
    expect(velho.avaliacao).toMatchObject({ status: 'renovado', rotulo: `Renovado por ${n.codigo}` })
    expect(velho.renovadoPor).toEqual({ id: n.id, codigo: n.codigo })
    expect(velho.encerramento).toMatchObject({ motivo: 'renovado', data: HOJE })
    expect(velho.acaoVencimento?.status).toBe('Concluída')
    expect(velho.permissoes).toMatchObject({ editar: false, reabrir: false, renovar: false, encerrar: false })

    await falha(reabrirContrato(ADMIN, antigo.id, { versao: velho.versao, justificativa: 'Tentar reabrir' }, CTX, HOJE), 'REGRA_NEGOCIO')
    await falha(renovarContrato(GESTOR, antigo.id, { versao: velho.versao, dataInicio: '2028-01-01', dataFim: '2028-12-31', valorMensal: 1 }, CTX, HOJE), 'REGRA_NEGOCIO')

    const [evVelho] = await db.select().from(auditoria).where(and(eq(auditoria.contratoId, antigo.id), eq(auditoria.acao, 'contrato.renovado')))
    expect(evVelho.descricao).toContain(n.codigo)
    const [evNovo] = await db.select().from(auditoria).where(and(eq(auditoria.contratoId, n.id), eq(auditoria.acao, 'contrato.criado')))
    expect(evNovo.descricao).toBe(`Cadastrou por renovação de ${antigo.codigo}`)
  })

  it('opção desativada depois segue no renovado (herdada); trocar para outra inativa, não', async () => {
    const antigo = await novo()
    await db.update(opcoesCadastro).set({ ativo: false }).where(eq(opcoesCadastro.id, opcaoParaDesativar))
    try {
      const n = await renovarContrato(GESTOR, antigo.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE)
      expect(n.filial).toMatchObject({ id: opcaoParaDesativar, ativo: false })
    } finally {
      await db.update(opcoesCadastro).set({ ativo: true }).where(eq(opcoesCadastro.id, opcaoParaDesativar))
    }
  })

  it('início precisa ser depois do início atual; com arquivo, documento "Renovação" no novo', async () => {
    const antigo = await novo()
    await falha(renovarContrato(GESTOR, antigo.id, { versao: 1, dataInicio: '2025-01-01', dataFim: '2027-12-31', valorMensal: 1 }, CTX, HOJE), 'VALIDACAO')
    const n = await renovarContrato(GESTOR, antigo.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1000 }, CTX, HOJE, pdf('renovacao-assinada'))
    const docs = await listarDocumentos(GESTOR, n.id)
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ tipo: 'Renovação', contratoId: n.id })
    expect(n.historico[0].documento?.id).toBe(docs[0].id)
    expect(await listarDocumentos(GESTOR, antigo.id)).toHaveLength(0)
  })

  it('restrito: quem renova não pode se trancar fora do novo', async () => {
    const antigo = await novo({ acessoRestrito: true })
    await falha(
      renovarContrato(GESTOR, antigo.id, { versao: 1, dataInicio: '2027-01-01', dataFim: '2027-12-31', valorMensal: 1, gestorEmail: 'outra@x.com' }, CTX, HOJE),
      'REGRA_NEGOCIO',
    )
    // Nada ficou pela metade: o antigo continua aberto.
    expect((await obterContrato(GESTOR, antigo.id, undefined, HOJE)).encerramento).toBeNull()
  })
})
