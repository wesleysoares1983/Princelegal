import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { exigirDentroDoLimite, gerarCsv, gerarXlsx, LIMITE_EXPORTACAO, type Coluna } from './exportacao'

interface Linha {
  nome: string
  inicio: string | null
  valor: number
  dias: number
  ativo: boolean
}

const COLUNAS: Coluna<Linha>[] = [
  { titulo: 'Nome', tipo: 'texto', valor: (l) => l.nome },
  { titulo: 'Início', tipo: 'data', valor: (l) => l.inicio },
  { titulo: 'Valor mensal', tipo: 'moeda', valor: (l) => l.valor },
  { titulo: 'Dias', tipo: 'inteiro', valor: (l) => l.dias },
  { titulo: 'Ativo', tipo: 'simnao', valor: (l) => l.ativo },
]

const LINHAS: Linha[] = [
  { nome: 'Locação – São Paulo', inicio: '2026-02-01', valor: 1234567.5, dias: 60, ativo: true },
  { nome: 'Texto; com "aspas"\ne quebra', inicio: null, valor: 0, dias: 0, ativo: false },
  { nome: '=HYPERLINK("http://x","clique")', inicio: '2026-12-31', valor: -0.1, dias: -5, ativo: true },
]

describe('gerarCsv (Excel pt-BR)', () => {
  const csv = gerarCsv(COLUNAS, LINHAS)
  const texto = csv.toString('utf8')

  it('UTF-8 com BOM, ponto e vírgula, CRLF', () => {
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(texto.slice(1).split('\r\n')[0]).toBe('Nome;Início;Valor mensal;Dias;Ativo')
  })

  it('datas dd/mm/aaaa, vírgula decimal sem milhar, Sim/Não, vazio para nulo', () => {
    const [, l1, l2] = texto.slice(1).split('\r\n')
    expect(l1).toBe('Locação – São Paulo;01/02/2026;1234567,50;60;Sim')
    expect(l2.endsWith(';;0,00;0;Não')).toBe(true)
  })

  it('aspas e quebra de linha entre aspas; ; dentro do texto não quebra a coluna', () => {
    expect(texto).toContain('"Texto; com ""aspas""\ne quebra"')
  })

  it('texto que parece fórmula ganha apóstrofo; número negativo não', () => {
    expect(texto).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`)
    expect(texto).toContain(';-0,10;-5;')
  })
})

describe('gerarXlsx', () => {
  it('data e dinheiro como células de verdade, cabeçalho congelado e autofiltro', async () => {
    const livro = new ExcelJS.Workbook()
    await livro.xlsx.load((await gerarXlsx('Contratos', COLUNAS, LINHAS)) as unknown as ArrayBuffer)
    const aba = livro.getWorksheet('Contratos')!

    expect(aba.getRow(1).values).toEqual([undefined, 'Nome', 'Início', 'Valor mensal', 'Dias', 'Ativo'])
    expect(aba.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(aba.autoFilter).toBeTruthy()

    const inicio = aba.getCell('B2')
    expect(inicio.value).toEqual(new Date(Date.UTC(2026, 1, 1)))
    expect(inicio.numFmt).toBe('dd/mm/yyyy')
    expect(aba.getCell('C2').value).toBe(1234567.5)
    expect(aba.getCell('C2').numFmt).toContain('R$')
    expect(aba.getCell('E2').value).toBe('Sim')
    expect(aba.getCell('B3').value).toBeNull()
    // No XLSX o texto vai como texto (sem apóstrofo): célula de texto não vira fórmula.
    expect(aba.getCell('A4').value).toBe('=HYPERLINK("http://x","clique")')
    expect(aba.getCell('A4').type).toBe(ExcelJS.ValueType.String)
  })
})

describe('exigirDentroDoLimite', () => {
  it(`até ${LIMITE_EXPORTACAO} passa; acima, 422 pedindo mais filtros`, () => {
    expect(() => exigirDentroDoLimite(LIMITE_EXPORTACAO)).not.toThrow()
    expect(() => exigirDentroDoLimite(LIMITE_EXPORTACAO + 1)).toThrow(/mais filtros/)
  })
})
