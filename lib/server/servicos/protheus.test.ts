import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// configProtheus() e memorizado: o ambiente tem de estar pronto antes da primeira leitura.
const pasta = mkdtempSync(join(tmpdir(), 'princelegal-protheus-teste-'))
vi.stubEnv('PROTHEUS_CACHE_DIR', pasta)
vi.stubEnv('PROTHEUS_CONTRACTS_URL', 'http://protheus.teste/contracts')
vi.stubEnv('PROTHEUS_CONTRACTS_TOKEN', 'token-de-teste')

const { listarContratosProtheus, sincronizarContratosProtheus } = await import('./protheus')

const contratoProtheus = {
  NUMERO: '000123',
  CLIENTE: 'Fornecedor X',
  CONTRATO: 'Locação',
  EMPRESA: '01',
  FILIAL: 'Curitiba',
  DATA_ASSINATURA: '20240110',
  DATA_INICIO: '20240201',
  DATA_FIM: '20260131',
  REAJUSTE: 'IPCA',
  SITUACAO: '',
  VALOR_ATUAL: 1500.5,
  VALOR_INI: 1200,
  VALOR_SALDO: '9000',
}

const respostaOk = () => Response.json({ data: { contracts: [contratoProtheus] } })

beforeAll(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.mocked(fetch).mockReset())
afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(pasta, { recursive: true, force: true })
})

describe('contratos do Protheus', () => {
  it('antes da primeira sincronização, avisa em vez de consultar o Protheus', async () => {
    const r = await listarContratosProtheus()
    expect(r).toMatchObject({ atualizadoEm: null, contratos: [] })
    expect(r.erro).toMatch(/ainda não foram sincronizados/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sincroniza com o token e converte o formato do Protheus', async () => {
    vi.mocked(fetch).mockResolvedValue(respostaOk())

    const r = await sincronizarContratosProtheus()

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('http://protheus.teste/contracts')
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-de-teste' })
    expect(r.erro).toBeUndefined()
    expect(r.contratos).toEqual([
      {
        numero: '000123',
        cliente: 'Fornecedor X',
        tipoContrato: 'Locação',
        empresa: '01',
        filial: 'Curitiba',
        dataAssinatura: '2024-01-10',
        dataInicio: '2024-02-01',
        dataFim: '2026-01-31',
        reajuste: 'IPCA',
        situacao: 'Não informado',
        valorAtual: 1500.5,
        valorInicial: 1200,
        valorSaldo: 0,
      },
    ])
    expect(await listarContratosProtheus()).toEqual(r)
  })

  it('com o Protheus fora, registra o erro e mantém os contratos anteriores', async () => {
    vi.mocked(fetch).mockResolvedValue(respostaOk())
    await sincronizarContratosProtheus()
    vi.mocked(fetch).mockResolvedValue(new Response('indisponível', { status: 503 }))

    const r = await sincronizarContratosProtheus()

    expect(r.erro).toMatch(/503/)
    expect(r.contratos).toHaveLength(1)
    expect((await listarContratosProtheus()).erro).toMatch(/503/)
  })
})
