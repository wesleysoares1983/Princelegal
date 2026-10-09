import { describe, expect, it } from 'vitest'
import { ErroApi } from './erros'
import { detectarFormato, sanitizarNome, validarArquivo } from './upload'

const bytes = (...partes: (string | number[])[]) =>
  new Uint8Array(Buffer.concat(partes.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))))

const PDF = bytes('%PDF-1.7\n%âãÏÓ\n1 0 obj<<>>endobj\n%%EOF')
const DOC = bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 'resto do OLE')
const DOCX = bytes([0x50, 0x4b, 0x03, 0x04], '....[Content_Types].xml....word/document.xml....')
const XLSX = bytes([0x50, 0x4b, 0x03, 0x04], '....[Content_Types].xml....xl/workbook.xml....')
const EXE = bytes('MZ\x90\x00\x03', 'This program cannot be run in DOS mode')

function codigo(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return e instanceof ErroApi ? e.codigo : 'OUTRO'
  }
}

describe('detectarFormato (pelo conteúdo)', () => {
  it('reconhece PDF, DOC e DOCX', () => {
    expect(detectarFormato(PDF)).toBe('pdf')
    expect(detectarFormato(DOC)).toBe('doc')
    expect(detectarFormato(DOCX)).toBe('docx')
  })
  it('PDF com lixo antes do cabeçalho (até 1 KB) ainda é PDF', () => {
    expect(detectarFormato(bytes('\r\n  ', '%PDF-1.4 ...'))).toBe('pdf')
  })
  it('não aceita executável, planilha (ZIP sem word/) nem texto', () => {
    expect(detectarFormato(EXE)).toBeNull()
    expect(detectarFormato(XLSX)).toBeNull()
    expect(detectarFormato(bytes('só texto'))).toBeNull()
  })
})

describe('validarArquivo', () => {
  it('executável renomeado para .pdf -> 415', () => {
    expect(codigo(() => validarArquivo({ name: 'contrato.pdf', bytes: EXE }, 1e6))).toBe('TIPO_NAO_SUPORTADO')
  })
  it('extensão que não bate com o conteúdo -> 415', () => {
    expect(codigo(() => validarArquivo({ name: 'contrato.docx', bytes: PDF }, 1e6))).toBe('TIPO_NAO_SUPORTADO')
  })
  it('acima do limite -> 413; vazio -> 400', () => {
    expect(codigo(() => validarArquivo({ name: 'a.pdf', bytes: PDF }, 10))).toBe('ARQUIVO_GRANDE')
    expect(codigo(() => validarArquivo({ name: 'a.pdf', bytes: new Uint8Array() }, 1e6))).toBe('VALIDACAO')
  })
  it('válido: mime pelo conteúdo, tamanho e sha256', () => {
    const r = validarArquivo({ name: 'Contrato Assinado.PDF', bytes: PDF }, 1e6)
    expect(r).toMatchObject({ formato: 'pdf', mime: 'application/pdf', tamanhoBytes: PDF.length, nomeArquivo: 'Contrato Assinado.PDF' })
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sanitizarNome', () => {
  it('tira pasta e caracteres de controle', () => {
    expect(sanitizarNome('C:\\fakepath\\..\\contrato\u0007.pdf', 'pdf')).toBe('contrato.pdf')
    expect(sanitizarNome('../../etc/passwd.pdf', 'pdf')).toBe('passwd.pdf')
  })
  it('corta em 200 caracteres preservando a extensão', () => {
    const r = sanitizarNome(`${'a'.repeat(300)}.docx`, 'docx')
    expect(r).toHaveLength(200)
    expect(r.endsWith('.docx')).toBe(true)
  })
  it('nome vazio vira "documento.ext"', () => {
    expect(sanitizarNome('.pdf', 'pdf')).toBe('documento.pdf')
  })
})
