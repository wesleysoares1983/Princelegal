import 'server-only'
import type ExcelJS from 'exceljs'
import { z } from 'zod'
import { formatarData } from '@/lib/shared/status'
import { erroRegraNegocio } from './http/erros'
import { respostaArquivo } from './http/download'

/**
 * Exportação de listas para Excel/CSV (docs/BACKEND_IMPLEMENTATION.md §8.12).
 *
 * Uma lista de colunas descreve a planilha; o mesmo dado sai nos dois formatos:
 * - XLSX: data e dinheiro como células de verdade (somam, filtram, ordenam),
 *   cabeçalho congelado e autofiltro;
 * - CSV para o Excel pt-BR: UTF-8 com BOM, `;`, `dd/mm/aaaa`, vírgula decimal.
 */

export const LIMITE_EXPORTACAO = 10_000

export const FORMATOS_EXPORTACAO = ['xlsx', 'csv'] as const
export type FormatoExportacao = (typeof FORMATOS_EXPORTACAO)[number]
export const esquemaFormato = z.enum(FORMATOS_EXPORTACAO, { error: 'Formato inválido: use xlsx ou csv.' }).default('xlsx')

type TipoColuna = 'texto' | 'data' | 'moeda' | 'inteiro' | 'simnao'
type Valor = string | number | boolean | null

export interface Coluna<T> {
  titulo: string
  tipo: TipoColuna
  /** Largura no XLSX, em caracteres. */
  largura?: number
  valor: (linha: T) => Valor
}

/** 422 antes de montar a planilha: a consulta busca LIMITE + 1 para saber se passou. */
export function exigirDentroDoLimite(quantidade: number) {
  if (quantidade > LIMITE_EXPORTACAO) {
    throw erroRegraNegocio(
      `A exportação passa de ${LIMITE_EXPORTACAO.toLocaleString('pt-BR')} linhas. Use mais filtros para reduzir o resultado.`,
      { limite: LIMITE_EXPORTACAO },
    )
  }
}

// ---------------------------------------------------------------- CSV

/**
 * Texto que começa com = + - @ (ou tab/CR) o Excel interpreta como fórmula
 * ("CSV injection"): prefixa com apóstrofo. Só em texto -- números saem crus.
 */
function textoSeguro(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

function celulaCsv(tipo: TipoColuna, v: Valor): string {
  if (v === null || v === '') return ''
  let s: string
  switch (tipo) {
    case 'data':
      s = formatarData(String(v))
      break
    case 'moeda':
      s = Number(v).toFixed(2).replace('.', ',')
      break
    case 'inteiro':
      s = String(v)
      break
    case 'simnao':
      s = v ? 'Sim' : 'Não'
      break
    default:
      s = textoSeguro(String(v))
  }
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function gerarCsv<T>(colunas: Coluna<T>[], linhas: T[]): Buffer {
  const cabecalho = colunas.map((c) => celulaCsv('texto', c.titulo)).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(c.tipo, c.valor(l))).join(';'))
  return Buffer.from('﻿' + [cabecalho, ...corpo].join('\r\n') + '\r\n', 'utf8')
}

// ---------------------------------------------------------------- XLSX

const FORMATO_NUMERO: Partial<Record<TipoColuna, string>> = {
  data: 'dd/mm/yyyy',
  moeda: '"R$" #,##0.00',
  inteiro: '0',
}

/** `AAAA-MM-DD` -> Date em UTC (o exceljs converte para o número de série sem fuso). */
const dataCelula = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))

function celulaXlsx(tipo: TipoColuna, v: Valor): ExcelJS.CellValue {
  if (v === null || v === '') return null
  switch (tipo) {
    case 'data':
      return dataCelula(String(v))
    case 'moeda':
    case 'inteiro':
      return Number(v)
    case 'simnao':
      return v ? 'Sim' : 'Não'
    default:
      return String(v)
  }
}

export async function gerarXlsx<T>(aba: string, colunas: Coluna<T>[], linhas: T[]): Promise<Buffer> {
  // Carregado só quando alguém exporta XLSX: é pesado e o resto do servidor não precisa dele.
  const { default: Excel } = await import('exceljs')
  const livro = new Excel.Workbook()
  livro.creator = 'Contratos Jurídicos'
  livro.created = new Date()
  const planilha = livro.addWorksheet(aba, { views: [{ state: 'frozen', ySplit: 1 }] })

  planilha.columns = colunas.map((c) => ({
    header: c.titulo,
    width: c.largura ?? Math.max(12, c.titulo.length + 2),
    style: FORMATO_NUMERO[c.tipo] ? { numFmt: FORMATO_NUMERO[c.tipo] } : {},
  }))
  for (const l of linhas) planilha.addRow(colunas.map((c) => celulaXlsx(c.tipo, c.valor(l))))

  const cabecalho = planilha.getRow(1)
  cabecalho.font = { bold: true }
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } }
  planilha.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } }

  return Buffer.from(await livro.xlsx.writeBuffer())
}

// ---------------------------------------------------------------- resposta

const MIME: Record<FormatoExportacao, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
}

/** Monta o arquivo e a resposta de download: `<base>-AAAA-MM-DD.<formato>`. */
export async function respostaExportacao<T>(opcoes: {
  formato: FormatoExportacao
  base: string
  aba: string
  hoje: string
  colunas: Coluna<T>[]
  linhas: T[]
}): Promise<Response> {
  const { formato, base, aba, hoje, colunas, linhas } = opcoes
  const corpo = formato === 'csv' ? gerarCsv(colunas, linhas) : await gerarXlsx(aba, colunas, linhas)
  return respostaArquivo({ corpo: new Uint8Array(corpo), mime: MIME[formato], nome: `${base}-${hoje}.${formato}` })
}
