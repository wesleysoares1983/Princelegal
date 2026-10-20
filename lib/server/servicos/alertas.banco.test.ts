import { readFile, rm } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { esquemaCriarContrato } from '@/lib/shared/contratos'
import { somarDias } from '@/lib/shared/datas'
import type { UsuarioSessao } from '@/lib/usuario'

// enviarEmail real (grava .eml), mas espionável para simular falha de SMTP.
const enviarEmail = vi.hoisted(() => ({ fn: null as null | ((...a: unknown[]) => unknown) }))
vi.mock('../email', async (original) => {
  const real = await original<typeof import('../email')>()
  const mock = vi.fn(real.enviarEmail)
  enviarEmail.fn = mock as never
  return { ...real, enviarEmail: mock }
})

const { db, fecharBanco } = await import('../db/cliente')
const { alertasEnviados, auditoria, opcoesCadastro } = await import('../db/esquema')
const { configEmail } = await import('../config')
const { criarContrato, encerrarContrato } = await import('./contratos')
const { alertasDoContrato, executarAlertas, montarEmail } = await import('./alertas')
const { filaAlertas } = await import('./painel')
const { ErroApi } = await import('../http/erros')
const espiao = () => enviarEmail.fn as unknown as ReturnType<typeof vi.fn>

afterAll(fecharBanco)

const HOJE = '2026-10-09'
const CTX = { ip: null, userAgent: null }
const ADMIN: UsuarioSessao = { matricula: 'LA', nome: 'Lia Admin', email: 'lia@x.com', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const OUTRO: UsuarioSessao = { matricula: 'LO', nome: 'Léo Outro', email: 'leo@x.com', perfil: null, cargo: 'FUNCIONARIO', nivel: 'leitura' }

let base: Record<string, unknown>
let seq = 0
beforeAll(async () => {
  await rm(configEmail().pastaArquivos, { recursive: true, force: true })
  const id = async (campo: (typeof opcoesCadastro.$inferInsert)['campo']) =>
    (await db.select().from(opcoesCadastro).where(and(eq(opcoesCadastro.campo, campo), eq(opcoesCadastro.ativo, true))).limit(1))[0].id
  base = {
    categoriaId: await id('categoria'),
    segmentoId: await id('segmento'),
    empresaId: await id('empresa'),
    filialId: await id('filial'),
    areaResponsavelId: await id('area-responsavel'),
    centroCustoId: await id('centro-custo'),
    fornecedorNome: 'Fornecedor Alertas',
    fornecedorDocumento: '11.222.333/0001-81',
    objeto: 'Objeto',
    gestorNome: 'Gestor',
    gestorEmail: 'gestor.alerta@x.com',
    responsavelJuridicoNome: 'Jurídico',
    responsavelJuridicoEmail: 'juridico.alerta@x.com',
    dataInicio: '2025-01-01',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 0,
    valorMensal: 100,
    formaPagamento: 'Boleto',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2025-01-01',
  }
})
// Chaves: retornar o mock faria o Vitest chamá-lo como limpeza depois de cada teste.
beforeEach(() => {
  espiao().mockClear()
})

const novo = (diasParaFim: number, extra: Record<string, unknown> = {}) => {
  seq++
  return criarContrato(
    ADMIN,
    esquemaCriarContrato.parse({ ...base, nome: `Contrato alertas ${seq}`, dataFim: somarDias(HOJE, diasParaFim), confirmarDuplicidade: true, ...extra }),
    CTX,
    HOJE,
  )
}
const deste = <T extends { contratoId: string }>(lista: T[], id: string) => lista.filter((x) => x.contratoId === id)

describe('executarAlertas', () => {
  it('contrato a 20 dias do fim: um e-mail ("30 dias"), 60/90/120 ignorados, auditoria; segunda execução não repete', async () => {
    const c = await novo(20)
    const r = await executarAlertas({ hoje: HOJE })
    expect(r.modo).toBe('arquivo')
    expect(deste(r.enviados, c.id)).toEqual([
      { contratoId: c.id, codigo: c.codigo, nome: c.nome, para: ['gestor.alerta@x.com', 'juridico.alerta@x.com'], itens: ['vence em 20 dias'] },
    ])
    const linhas = await db.select().from(alertasEnviados).where(eq(alertasEnviados.contratoId, c.id))
    expect(linhas.map((l) => `${l.situacao}:${l.limiarDias}`).sort()).toEqual(['enviado:30', 'ignorado:120', 'ignorado:60', 'ignorado:90'])
    const [ev] = await db.select().from(auditoria).where(and(eq(auditoria.contratoId, c.id), eq(auditoria.acao, 'alerta.enviado')))
    expect(ev).toMatchObject({ usuarioMatricula: null, categoria: 'contrato' })

    const r2 = await executarAlertas({ hoje: HOJE })
    expect(deste(r2.enviados, c.id)).toHaveLength(0)
    // No dia seguinte nada; quando chega a 15 dias, o próximo limiar.
    expect(deste((await executarAlertas({ hoje: somarDias(HOJE, 5) })).enviados, c.id)[0]?.itens).toEqual(['vence em 15 dias'])
  })

  it('o .eml gravado tem assunto, destinatários e o link do contrato', async () => {
    const c = await novo(10)
    await executarAlertas({ hoje: HOJE })
    const chamada = espiao().mock.calls.find(([e]) => (e as { assunto: string }).assunto.includes(c.codigo))
    expect(chamada).toBeDefined()
    const resultado = await espiao().mock.results[espiao().mock.calls.indexOf(chamada!)].value
    const eml = await readFile(resultado.caminho, 'utf8')
    expect(eml).toMatch(/To: gestor\.alerta@x\.com, juridico\.alerta@x\.com/)
    expect(eml).toContain(`http://contratos.teste/contratos/${c.id}`)
  })

  it('simulação: mostra o que seria enviado, sem e-mail e sem gravar', async () => {
    const c = await novo(50)
    const r = await executarAlertas({ hoje: HOJE, simular: true })
    expect(deste(r.enviados, c.id)[0].itens).toEqual(['vence em 50 dias'])
    expect(espiao()).not.toHaveBeenCalled()
    expect(await db.select().from(alertasEnviados).where(eq(alertasEnviados.contratoId, c.id))).toHaveLength(0)
  })

  it('vencido: uma vez só; encerrado: nada', async () => {
    const v = await novo(-3)
    const e = await novo(5)
    await encerrarContrato(ADMIN, e.id, { versao: 1, justificativa: 'Encerrado antes do alerta' }, CTX, HOJE)
    const r = await executarAlertas({ hoje: HOJE })
    expect(deste(r.enviados, v.id)[0].itens).toEqual(['fora da vigência há 3 dias'])
    expect(deste(r.enviados, e.id)).toHaveLength(0)
    expect(deste((await executarAlertas({ hoje: somarDias(HOJE, 1) })).enviados, v.id)).toHaveLength(0)
  })

  it('prazo de aviso e vencimento no mesmo dia: um e-mail só com os dois', async () => {
    const c = await novo(25, { prazoAvisoCancelamentoDias: 20 }) // aviso em 5 dias
    const r = await executarAlertas({ hoje: HOJE })
    expect(deste(r.enviados, c.id)[0].itens).toEqual(['vence em 25 dias', 'prazo de aviso em 5 dias'])
    expect(espiao().mock.calls.filter(([e]) => (e as { assunto: string }).assunto.includes(c.codigo))).toHaveLength(1)
  })

  it('falha de envio: registra, tenta de novo nos dias seguintes e desiste depois de 3', async () => {
    const c = await novo(12)
    const falhar = () => espiao().mockImplementation(async (e: { assunto: string }) => {
      if (e.assunto.includes(c.codigo)) throw new Error('SMTP fora do ar')
      return { modo: 'arquivo', caminho: '' }
    })
    falhar()
    try {
      for (let dia = 0; dia < 3; dia++) {
        const r = await executarAlertas({ hoje: somarDias(HOJE, dia) })
        expect(r.falhas.find((f) => f.contratoId === c.id)?.erro).toBe('SMTP fora do ar')
      }
      const r4 = await executarAlertas({ hoje: somarDias(HOJE, 3) })
      expect(r4.desistidos.find((d) => d.contratoId === c.id)).toBeDefined()
      expect(r4.falhas.find((f) => f.contratoId === c.id)).toBeUndefined()
    } finally {
      espiao().mockReset()
      const real = (await vi.importActual<typeof import('../email')>('../email')).enviarEmail
      espiao().mockImplementation(real)
    }
    const historico = await alertasDoContrato(ADMIN, c.id)
    expect(historico.filter((h) => h.situacao === 'falhou')).toHaveLength(3)
  })

  it('duas execuções ao mesmo tempo: a segunda não faz nada', async () => {
    const [a, b] = await Promise.all([executarAlertas({ hoje: HOJE, simular: true }), executarAlertas({ hoje: HOJE, simular: true })])
    expect([a.emAndamento, b.emAndamento].sort()).toEqual([false, true])
  })
})

describe('leitura e e-mail', () => {
  it('fila de Alertas mostra o último e-mail; histórico respeita contrato restrito', async () => {
    const c = await novo(8, { acessoRestrito: true, gestorEmail: 'lia@x.com' })
    await executarAlertas({ hoje: HOJE })
    const fila = await filaAlertas(ADMIN, HOJE)
    expect(fila.itens.find((i) => i.id === c.id)?.ultimoAlertaEnviado).toMatchObject({ tipo: 'vencimento', limiarDias: 15 })
    const e = await alertasDoContrato(OUTRO, c.id).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErroApi)
  })

  it('montarEmail escapa HTML do que foi digitado e avisa da renovação automática', async () => {
    const c = await novo(30, { nome: 'Contrato <script>alert(1)</script>', renovacaoAutomatica: true })
    const [linha] = await db.select().from((await import('../db/esquema')).contratos).where(eq((await import('../db/esquema')).contratos.id, c.id))
    const email = montarEmail(linha, [{ tipo: 'vencimento', limiarDias: 30, dataReferencia: linha.dataFim, dias: 30 }], ['a@x.com'])
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.texto).toContain('NÃO registra a renovação sozinho')
    expect(email.assunto).toBe(`[Contratos] ${c.codigo} Contrato <script>alert(1)</script> — vence em 30 dias`)
  })
})
