import { z } from 'zod'
import type { Carimbo } from './contratos'
import { ehDataIso, somarAnos, somarMeses } from './datas'

/** Obrigações do contrato: o que cliente e servidor compartilham (docs/BACKEND_IMPLEMENTATION.md §8.8). */

export const RECORRENCIAS = ['Única', 'Mensal', 'Anual', 'Por evento'] as const
export type Recorrencia = (typeof RECORRENCIAS)[number]

export const SITUACOES_OBRIGACAO = ['pendente', 'cumprida', 'cancelada'] as const
export type SituacaoObrigacao = (typeof SITUACOES_OBRIGACAO)[number]

export const ehRecorrente = (r: Recorrencia) => r === 'Mensal' || r === 'Anual'

/**
 * Próxima ocorrência de uma obrigação recorrente (null para Única/Por evento).
 *
 * Sempre a partir do VENCIMENTO, não de quando foi cumprida: pagar a parcela
 * de 10/03 no dia 15 não empurra a de abril para o dia 15. `diaAncora` é o
 * dia original, para 31/01 → 28/02 (ou 29/02) → 31/03 não escorregar.
 */
export function proximaData(data: string, recorrencia: Recorrencia, diaAncora: number | null): string | null {
  if (recorrencia === 'Mensal') return somarMeses(data, 1, diaAncora ?? undefined)
  if (recorrencia === 'Anual') return somarAnos(data, 1, diaAncora ?? undefined)
  return null
}

/** Primeira ocorrência da série em ou depois de `aPartirDe` (para levar a série a um contrato renovado). */
export function primeiraOcorrenciaDesde(data: string, recorrencia: Recorrencia, diaAncora: number | null, aPartirDe: string): string {
  let atual = data
  for (let i = 0; i < 1200 && atual < aPartirDe; i++) {
    const proxima = proximaData(atual, recorrencia, diaAncora)
    if (!proxima) break
    atual = proxima
  }
  return atual
}

export interface Obrigacao {
  id: string
  contrato: { id: string; codigo: string; nome: string; encerrado: boolean }
  descricao: string
  responsavel: string
  data: string
  recorrencia: Recorrencia
  situacao: SituacaoObrigacao
  /** Pendente e com vencimento antes de hoje. */
  atrasada: boolean
  cumpridaEm: string | null
  cumpridaPor: Carimbo | null
  observacaoCumprimento: string | null
  canceladaEm: string | null
  motivoCancelamento: string | null
  /** Gerada pelo sistema ao cumprir a anterior (série recorrente). */
  gerada: boolean
  criadoPor: Carimbo | null
}

const texto = (min: number, max: number, rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(min, min <= 1 ? `Informe ${rotulo}.` : `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: no mínimo ${min} caracteres.`)
    .max(max, `Use no máximo ${max} caracteres.`)

const data = (rotulo: string) => z.string({ error: `Informe ${rotulo}.` }).refine(ehDataIso, `Informe ${rotulo} válida (AAAA-MM-DD).`)

export const esquemaCriarObrigacao = z.object({
  descricao: texto(3, 500, 'a descrição'),
  responsavel: texto(2, 100, 'o responsável'),
  data: data('a data'),
  recorrencia: z.enum(RECORRENCIAS, { error: 'Selecione a recorrência.' }),
})
export type DadosCriarObrigacao = z.infer<typeof esquemaCriarObrigacao>

export const esquemaEditarObrigacao = esquemaCriarObrigacao
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, { error: 'Nada para alterar.', path: ['descricao'] })
export type DadosEditarObrigacao = z.infer<typeof esquemaEditarObrigacao>

export const esquemaCumprir = z.object({
  cumpridaEm: data('a data de cumprimento').optional(),
  observacao: z
    .string()
    .trim()
    .max(1000, 'Use no máximo 1000 caracteres.')
    .optional()
    .transform((v) => v || null),
})
export type DadosCumprir = Omit<z.infer<typeof esquemaCumprir>, 'observacao'> & { observacao?: string | null }

export const esquemaCancelarObrigacao = z.object({
  motivo: texto(3, 500, 'o motivo'),
})

export const esquemaListarObrigacoes = z.object({
  busca: z.string().trim().max(200).optional(),
  responsavel: z.string().trim().max(100).optional(),
  vigenciaDe: data('a data inicial').optional(),
  vigenciaAte: data('a data final').optional(),
  situacao: z.enum([...SITUACOES_OBRIGACAO, 'todas']).default('pendente'),
  atrasadas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  contratoId: z.uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
})
export type FiltroObrigacoes = z.infer<typeof esquemaListarObrigacoes>
