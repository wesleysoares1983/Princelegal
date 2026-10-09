import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { esquemaCriarContrato } from '@/lib/shared/contratos'
import type { UsuarioSessao } from '@/lib/usuario'
import { db, fecharBanco } from '../db/cliente'
import { obrigacoes, opcoesCadastro } from '../db/esquema'
import { ErroApi } from '../http/erros'
import { anularAditivo, registrarAditivo, renovarContrato } from './aditivos'
import { criarContrato, encerrarContrato, obterContrato, reabrirContrato } from './contratos'
import {
  cancelarObrigacao,
  criarObrigacao,
  cumprirObrigacao,
  desfazerCumprimento,
  editarObrigacao,
  listarObrigacoes,
  obrigacoesDoContrato,
} from './obrigacoes'

afterAll(fecharBanco)

const HOJE = '2026-03-15'
const CTX = { ip: '10.0.0.3', userAgent: 'vitest' }
const ADMIN: UsuarioSessao = { matricula: 'OA', nome: 'Otto Admin', email: 'otto@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const GESTOR: UsuarioSessao = { matricula: 'OG', nome: 'Olívia Gestora', email: 'olivia@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }
const OUTRO: UsuarioSessao = { matricula: 'OO', nome: 'Oscar Outro', email: 'oscar@x.com', perfil: null, cargo: 'USUARIO', nivel: 'user' }

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
    fornecedorNome: 'Fornecedor Obrigações',
    fornecedorDocumento: '52998224725',
    objeto: 'Objeto',
    gestorNome: 'Olívia Gestora',
    gestorEmail: 'olivia@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'jur.obr@x.com',
    dataInicio: '2026-01-01',
    dataFim: '2026-04-15',
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
  return criarContrato(GESTOR, esquemaCriarContrato.parse({ ...base, nome: `Contrato obrigações ${seq}`, confirmarDuplicidade: true, ...extra }), CTX, HOJE)
}
const nova = (contratoId: string, dados: Partial<{ descricao: string; responsavel: string; data: string; recorrencia: 'Única' | 'Mensal' | 'Anual' | 'Por evento' }> = {}) =>
  criarObrigacao(GESTOR, contratoId, { descricao: 'Pagamento mensal', responsavel: 'Financeiro', data: '2026-01-31', recorrencia: 'Mensal', ...dados }, CTX, HOJE)

describe('recorrência — o "done when" do M5', () => {
  it('mensal criada em 31/01 gera 28/02, depois 31/03, e para no término (15/04)', async () => {
    const c = await novoContrato()
    const { obrigacao } = await nova(c.id)
    const r1 = await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)
    expect(r1.proxima?.data).toBe('2026-02-28')
    expect(r1.proxima?.gerada).toBe(true)
    const r2 = await cumprirObrigacao(GESTOR, r1.proxima!.id, { cumpridaEm: '2026-03-05', observacao: 'Pago com atraso' }, CTX, HOJE)
    expect(r2.proxima?.data).toBe('2026-03-31') // âncora 31, a partir do vencimento (não do pagamento)
    const r3 = await cumprirObrigacao(GESTOR, r2.proxima!.id, {}, CTX, HOJE)
    expect(r3.proxima).toBeNull() // 30/04 passa do término
  })

  it('Única/Por evento não geram; cumprir duas vezes -> CONFLITO; data futura -> VALIDACAO', async () => {
    const c = await novoContrato()
    const { obrigacao } = await nova(c.id, { recorrencia: 'Única', data: '2026-02-10' })
    await falha(cumprirObrigacao(GESTOR, obrigacao.id, { cumpridaEm: '2026-03-16' }, CTX, HOJE), 'VALIDACAO')
    expect((await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)).proxima).toBeNull()
    await falha(cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE), 'CONFLITO')
  })

  it('data fora da vigência gera aviso, não erro', async () => {
    const c = await novoContrato()
    const { avisos } = await nova(c.id, { data: '2026-06-01', recorrencia: 'Única' })
    expect(avisos).toEqual(['Data fora da vigência do contrato.'])
  })
})

describe('desfazer, cancelar, editar', () => {
  it('desfazer: só quem marcou ou admin; apaga a gerada intocada; recusa se a gerada foi mexida', async () => {
    const c = await novoContrato()
    const { obrigacao } = await nova(c.id)
    const r = await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)
    await falha(desfazerCumprimento(OUTRO, obrigacao.id, CTX, HOJE), 'SEM_PERMISSAO')
    const desfeita = await desfazerCumprimento(GESTOR, obrigacao.id, CTX, HOJE)
    expect(desfeita.situacao).toBe('pendente')
    expect(await db.select().from(obrigacoes).where(eq(obrigacoes.id, r.proxima!.id))).toHaveLength(0)

    const r2 = await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)
    await editarObrigacao(GESTOR, r2.proxima!.id, { responsavel: 'Tesouraria' }, CTX, HOJE)
    await falha(desfazerCumprimento(ADMIN, obrigacao.id, CTX, HOJE), 'REGRA_NEGOCIO')
  })

  it('cancelar encerra a série; só pendente', async () => {
    const c = await novoContrato()
    const { obrigacao } = await nova(c.id)
    const cancelada = await cancelarObrigacao(OUTRO, obrigacao.id, 'Fornecedor mudou a data', CTX, HOJE)
    expect(cancelada).toMatchObject({ situacao: 'cancelada', motivoCancelamento: 'Fornecedor mudou a data' })
    await falha(cancelarObrigacao(OUTRO, obrigacao.id, 'De novo', CTX, HOJE), 'REGRA_NEGOCIO')
    await falha(cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE), 'CONFLITO')
  })

  it('editar: só pendente; mudar a data reancora a série', async () => {
    const c = await novoContrato()
    const { obrigacao } = await nova(c.id)
    await editarObrigacao(GESTOR, obrigacao.id, { data: '2026-02-10' }, CTX, HOJE)
    const r = await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)
    expect(r.proxima?.data).toBe('2026-03-10')
    await falha(editarObrigacao(GESTOR, obrigacao.id, { descricao: 'Mudar cumprida' }, CTX, HOJE), 'REGRA_NEGOCIO')
  })
})

describe('contrato encerrado e restrito', () => {
  it('encerrado: não cria nem edita; ainda cumpre e cancela (sem gerar a próxima)', async () => {
    const c = await novoContrato()
    const { obrigacao: atrasada } = await nova(c.id, { data: '2026-02-28' })
    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Fim antecipado', data: '2026-03-01' }, CTX, HOJE)
    await falha(nova(c.id), 'REGRA_NEGOCIO')
    await falha(editarObrigacao(GESTOR, atrasada.id, { descricao: 'x x x' }, CTX, HOJE), 'REGRA_NEGOCIO')
    expect((await cumprirObrigacao(GESTOR, atrasada.id, {}, CTX, HOJE)).proxima).toBeNull()
  })

  it('restrito: fora da lista e 404 nas ações para quem não vê', async () => {
    const c = await novoContrato({ acessoRestrito: true })
    const { obrigacao } = await nova(c.id, { descricao: 'Obrigação sigilosa XPTO' })
    const lista = await listarObrigacoes(OUTRO, { situacao: 'todas', busca: 'XPTO', atrasadas: false, pagina: 1, porPagina: 50 }, HOJE)
    expect(lista.total).toBe(0)
    await falha(cumprirObrigacao(OUTRO, obrigacao.id, {}, CTX, HOJE), 'NAO_ENCONTRADO')
    await falha(obrigacoesDoContrato(OUTRO, c.id, HOJE), 'NAO_ENCONTRADO')
  })
})

describe('ganchos das operações do contrato', () => {
  it('encerrar cancela as futuras (atrasadas ficam); reabrir devolve só essas', async () => {
    const c = await novoContrato()
    const { obrigacao: atrasada } = await nova(c.id, { data: '2026-02-28', recorrencia: 'Única' })
    const { obrigacao: futura } = await nova(c.id, { data: '2026-04-10', recorrencia: 'Única' })
    const { obrigacao: manual } = await nova(c.id, { data: '2026-04-12', recorrencia: 'Única' })
    await cancelarObrigacao(GESTOR, manual.id, 'Cancelada à mão', CTX, HOJE)

    await encerrarContrato(ADMIN, c.id, { versao: 1, justificativa: 'Encerramento teste', data: '2026-03-10' }, CTX, HOJE)
    let lista = await obrigacoesDoContrato(GESTOR, c.id, HOJE)
    const por = (id: string) => lista.find((o) => o.id === id)!
    expect(por(atrasada.id).situacao).toBe('pendente')
    expect(por(futura.id)).toMatchObject({ situacao: 'cancelada', motivoCancelamento: 'Contrato encerrado' })

    await reabrirContrato(ADMIN, c.id, { versao: 2, justificativa: 'Engano' }, CTX, HOJE)
    lista = await obrigacoesDoContrato(GESTOR, c.id, HOJE)
    expect(por(futura.id).situacao).toBe('pendente')
    expect(por(manual.id).situacao).toBe('cancelada') // a cancelada à mão continua cancelada
  })

  it('aditivo que estende retoma a série parada no término antigo', async () => {
    let c = await novoContrato()
    const { obrigacao } = await nova(c.id, { data: '2026-03-31' })
    expect((await cumprirObrigacao(GESTOR, obrigacao.id, {}, CTX, HOJE)).proxima).toBeNull() // 30/04 > 15/04
    c = await registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2026-04-16', dataFim: '2026-12-31', valorMensal: 500 }, CTX, HOJE)
    const pendentes = (await obrigacoesDoContrato(GESTOR, c.id, HOJE)).filter((o) => o.situacao === 'pendente')
    expect(pendentes.map((o) => o.data)).toEqual(['2026-04-30'])
  })

  it('encurtar (aditivo ou anulação) cancela as geradas intocadas além do fim; as manuais ficam', async () => {
    let c = await novoContrato({ dataFim: '2026-12-31' })
    const { obrigacao } = await nova(c.id, { data: '2026-05-31' })
    const { proxima } = await cumprirObrigacao(GESTOR, obrigacao.id, { cumpridaEm: '2026-03-15' }, CTX, HOJE) // gera 30/06
    const { obrigacao: manual } = await nova(c.id, { data: '2026-08-01', recorrencia: 'Única' })

    c = await registrarAditivo(GESTOR, c.id, { versao: 1, dataInicio: '2026-01-01', dataFim: '2026-06-15', valorMensal: 500 }, CTX, HOJE)
    let lista = await obrigacoesDoContrato(GESTOR, c.id, HOJE)
    expect(lista.find((o) => o.id === proxima!.id)).toMatchObject({ situacao: 'cancelada', motivoCancelamento: 'Vigência reduzida pelo Aditivo 01' })
    expect(lista.find((o) => o.id === manual.id)?.situacao).toBe('pendente')

    // Anular o aditivo que encurtou devolve o término de 31/12: a série retoma.
    const doAdmin = await obterContrato(ADMIN, c.id, undefined, HOJE)
    await anularAditivo(ADMIN, c.id, doAdmin.historico.at(-1)!.id, { versao: c.versao, justificativa: 'Encurtamento indevido' }, CTX, HOJE)
    lista = await obrigacoesDoContrato(GESTOR, c.id, HOJE)
    expect(lista.filter((o) => o.situacao === 'pendente').map((o) => o.data).sort()).toEqual(['2026-06-30', '2026-08-01'])
  })

  it('renovar leva as séries pendentes para o novo; Única fica no antigo', async () => {
    const c = await novoContrato()
    const { obrigacao: mensal } = await nova(c.id, { data: '2026-04-10', descricao: 'Aluguel' })
    const { obrigacao: unica } = await nova(c.id, { data: '2026-04-01', recorrencia: 'Única', descricao: 'Vistoria' })
    const n = await renovarContrato(GESTOR, c.id, { versao: 1, dataInicio: '2026-04-16', dataFim: '2027-04-15', valorMensal: 600 }, CTX, HOJE)

    const doAntigo = await obrigacoesDoContrato(GESTOR, c.id, HOJE)
    expect(doAntigo.find((o) => o.id === mensal.id)).toMatchObject({ situacao: 'cancelada', motivoCancelamento: `Transferida para ${n.codigo}` })
    expect(doAntigo.find((o) => o.id === unica.id)?.situacao).toBe('pendente')

    const doNovo = await obrigacoesDoContrato(GESTOR, n.id, HOJE)
    expect(doNovo).toHaveLength(1)
    expect(doNovo[0]).toMatchObject({ descricao: 'Aluguel', data: '2026-05-10', recorrencia: 'Mensal', situacao: 'pendente' })
  })
})

describe('listarObrigacoes', () => {
  it('filtra por situação, atrasadas, responsável e busca; facetas de responsáveis', async () => {
    const c = await novoContrato({ nome: 'Contrato Listagem Ômega' })
    await nova(c.id, { data: '2026-02-01', recorrencia: 'Única', responsavel: 'Jurídico Ômega', descricao: 'Renovar seguro' })
    await nova(c.id, { data: '2026-04-01', recorrencia: 'Única', responsavel: 'Jurídico Ômega', descricao: 'Enviar relatório' })
    const f = { situacao: 'pendente' as const, atrasadas: false, pagina: 1, porPagina: 200 }

    const atrasadas = await listarObrigacoes(GESTOR, { ...f, atrasadas: true, responsavel: 'Jurídico Ômega' }, HOJE)
    expect(atrasadas.itens.map((o) => o.descricao)).toEqual(['Renovar seguro'])
    expect(atrasadas.itens[0].atrasada).toBe(true)

    const busca = await listarObrigacoes(GESTOR, { ...f, busca: 'omega relatorio' }, HOJE)
    expect(busca.itens.map((o) => o.descricao)).toEqual(['Enviar relatório'])
    expect(busca.facetas.responsaveis).toContain('Jurídico Ômega')

    const porVigencia = await listarObrigacoes(GESTOR, { ...f, contratoId: c.id, vigenciaDe: '2027-01-01' }, HOJE)
    expect(porVigencia.total).toBe(0) // contrato termina em 15/04/2026
  })
})
