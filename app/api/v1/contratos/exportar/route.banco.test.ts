import { and, desc, eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { esquemaCriarContrato } from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import type { UsuarioSessao } from '@/lib/usuario'

/** Exportações (§8.12) pela borda HTTP: contratos e obrigações. */

const obterSessao = vi.hoisted(() => vi.fn<() => Promise<UsuarioSessao | null>>())
vi.mock('@/lib/server/sessao', () => ({ obterSessao }))

const { GET: EXPORTAR_CONTRATOS } = await import('./route')
const { GET: EXPORTAR_OBRIGACOES } = await import('../../obrigacoes/exportar/route')
const { criarContrato } = await import('@/lib/server/servicos/contratos')
const { criarObrigacao } = await import('@/lib/server/servicos/obrigacoes')
const { db, fecharBanco } = await import('@/lib/server/db/cliente')
const { auditoria, opcoesCadastro } = await import('@/lib/server/db/esquema')

afterAll(fecharBanco)

const ADMIN: UsuarioSessao = { matricula: 'EA', nome: 'Exporta Admin', email: 'exporta.admin@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const COMUM: UsuarioSessao = { matricula: 'EC', nome: 'Exporta Comum', email: 'exporta.comum@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const CTX = { ip: null, userAgent: 'teste' }
const MARCA = 'Zebraexport'

const get = (rota: (r: NextRequest, c: object) => Promise<Response>, url: string) => rota(new NextRequest(`http://localhost/api/v1${url}`), {})
const linhasCsv = async (res: Response) => (await res.text()).replace(/^﻿/, '').trimEnd().split('\r\n')

let aberto: { id: string; codigo: string }
let restrito: { id: string; codigo: string }

beforeAll(async () => {
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) => {
    const [o] = await db.select().from(opcoesCadastro).where(eq(opcoesCadastro.campo, campo)).limit(1)
    return o.id
  }
  const base = {
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Exportação Ltda',
    fornecedorDocumento: '12.ABC.345/01DE-35',
    objeto: 'Objeto',
    gestorNome: 'Gestora',
    gestorEmail: 'gestora.exporta@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'juridico.exporta@x.com',
    dataInicio: '2026-02-01',
    dataFim: '2027-01-31',
    renovacaoAutomatica: true,
    prazoAvisoCancelamentoDias: 60,
    valorMensal: 1234.56,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2026-02-01',
    multaRescisao: 5000,
    acessoRestrito: false,
    confirmarDuplicidade: true,
  }
  aberto = await criarContrato(ADMIN, esquemaCriarContrato.parse({ ...base, nome: `${MARCA} Locação Ação` }), CTX)
  restrito = await criarContrato(ADMIN, esquemaCriarContrato.parse({ ...base, nome: `${MARCA} Sigiloso`, acessoRestrito: true }), CTX)
  await criarObrigacao(ADMIN, aberto.id, { descricao: `${MARCA} pagar seguro`, responsavel: 'Financeiro', data: '2026-03-10', recorrencia: 'Única' }, CTX)
  await criarObrigacao(ADMIN, restrito.id, { descricao: `${MARCA} obrigação sigilosa`, responsavel: 'Financeiro', data: '2026-03-11', recorrencia: 'Única' }, CTX)
})

beforeEach(() => obterSessao.mockResolvedValue(ADMIN))

describe('GET /api/v1/contratos/exportar', () => {
  it('CSV pt-BR com os filtros da tela; restrito invisível fica de fora', async () => {
    obterSessao.mockResolvedValue(COMUM)
    const res = await get(EXPORTAR_CONTRATOS, `/contratos/exportar?formato=csv&busca=${MARCA}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toContain(`filename="contratos-${hojeSP()}.csv"`)
    expect(res.headers.get('cache-control')).toBe('private, no-store')

    const [cabecalho, ...linhas] = await linhasCsv(res)
    expect(cabecalho.split(';')).toHaveLength(26)
    expect(cabecalho.startsWith('Código;Nome;Status;Categoria')).toBe(true)
    expect(linhas).toHaveLength(1)
    const l = linhas[0].split(';')
    expect(l[0]).toBe(aberto.codigo)
    expect(l[1]).toBe(`${MARCA} Locação Ação`)
    expect(l[10]).toBe('12.ABC.345/01DE-35')
    expect(l.slice(13, 20)).toEqual(['01/02/2026', '31/01/2027', '60', '02/12/2026', 'Sim', '1234,56', '14814,72'])
    expect(l[23]).toBe('5000,00')
    expect(l[25]).toBe('Não')
  })

  it('administrador vê os dois; XLSX com células de data e dinheiro', async () => {
    const res = await get(EXPORTAR_CONTRATOS, `/contratos/exportar?busca=${MARCA}&ordenar=codigo`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain(`contratos-${hojeSP()}.xlsx`)
    const livro = new ExcelJS.Workbook()
    await livro.xlsx.load(await res.arrayBuffer())
    const aba = livro.getWorksheet('Contratos')!
    expect(aba.rowCount).toBe(3)
    expect(aba.getCell('A2').value).toBe(aberto.codigo)
    expect(aba.getCell('A3').value).toBe(restrito.codigo)
    expect(aba.getCell('Z3').value).toBe('Sim')
    expect(aba.getCell('N2').value).toEqual(new Date(Date.UTC(2026, 1, 1)))
    expect(aba.getCell('S2').value).toBe(1234.56)
  })

  it('registra a exportação na auditoria, com filtros e quantidade', async () => {
    obterSessao.mockResolvedValue(COMUM)
    await get(EXPORTAR_CONTRATOS, `/contratos/exportar?formato=csv&busca=${MARCA}&status=ativos`)
    const [ev] = await db
      .select()
      .from(auditoria)
      .where(and(eq(auditoria.acao, 'exportacao.contratos'), eq(auditoria.usuarioMatricula, 'EC')))
      .orderBy(desc(auditoria.ocorridoEm))
      .limit(1)
    expect(ev.categoria).toBe('exportacao')
    expect(ev.descricao).toBe('Exportou 1 contrato (CSV)')
    expect(ev.dados).toMatchObject({ formato: 'csv', linhas: 1, filtros: { busca: MARCA, status: 'ativos', ordenar: 'vencimento' } })
  })

  it('formato inválido -> 400; sem sessão -> 401', async () => {
    expect((await get(EXPORTAR_CONTRATOS, '/contratos/exportar?formato=pdf')).status).toBe(400)
    obterSessao.mockResolvedValue(null)
    expect((await get(EXPORTAR_CONTRATOS, '/contratos/exportar')).status).toBe(401)
  })
})

describe('GET /api/v1/obrigacoes/exportar', () => {
  it('CSV com contrato, situação e atrasada; só de contratos visíveis; auditado', async () => {
    obterSessao.mockResolvedValue(COMUM)
    const res = await get(EXPORTAR_OBRIGACOES, `/obrigacoes/exportar?formato=csv&busca=${MARCA}&situacao=todas`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain(`obrigacoes-${hojeSP()}.csv`)
    const [cabecalho, ...linhas] = await linhasCsv(res)
    expect(cabecalho).toBe('Código do contrato;Contrato;Descrição;Responsável;Data;Recorrência;Situação;Cumprida em;Cumprida por;Atrasada')
    expect(linhas).toEqual([`${aberto.codigo};${MARCA} Locação Ação;${MARCA} pagar seguro;Financeiro;10/03/2026;Única;Pendente;;;Sim`])

    const [ev] = await db.select().from(auditoria).where(eq(auditoria.acao, 'exportacao.obrigacoes')).orderBy(desc(auditoria.ocorridoEm)).limit(1)
    expect(ev.descricao).toBe('Exportou 1 obrigação (CSV)')
  })

  it('administrador exporta XLSX com as duas', async () => {
    const res = await get(EXPORTAR_OBRIGACOES, `/obrigacoes/exportar?busca=${MARCA}`)
    const livro = new ExcelJS.Workbook()
    await livro.xlsx.load(await res.arrayBuffer())
    const aba = livro.getWorksheet('Obrigações')!
    expect(aba.rowCount).toBe(3)
    expect(aba.getCell('E2').value).toEqual(new Date(Date.UTC(2026, 2, 10)))
  })
})
