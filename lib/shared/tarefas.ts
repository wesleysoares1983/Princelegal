import { z } from 'zod'
import type { Carimbo } from './contratos'
import { ehDataIso } from './datas'

/** Tarefas do quadro: o que cliente e servidor compartilham (docs/TASKS_IMPLEMENTATION_PLAN.md §4). */

export const COLUNAS_TAREFA = ['A fazer', 'Em andamento', 'Concluída'] as const
export type ColunaTarefa = (typeof COLUNAS_TAREFA)[number]

/** Quantas concluídas o quadro traz por padrão (as que entraram na coluna mais recentemente). */
export const LIMITE_CONCLUIDAS_PADRAO = 100

export interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  responsavel: string | null
  prazo: string | null
  /** Não concluída e com prazo antes de hoje. */
  atrasada: boolean
  coluna: ColunaTarefa
  /** Só quando o usuário vê o contrato; ver `vinculoRestrito`. */
  contrato: { id: string; codigo: string; nome: string; encerrado: boolean } | null
  /** Há vínculo, mas com um contrato restrito que o usuário não vê. */
  vinculoRestrito: boolean
  criadoPor: Carimbo
  criadoEm: string
  versao: number
}

export interface QuadroTarefas {
  itens: Tarefa[]
  /** Há mais concluídas além das que vieram. */
  maisConcluidas: boolean
  facetas: { responsaveis: string[] }
}

const texto = (min: number, max: number, rotulo: string) =>
  z
    .string({ error: `Informe ${rotulo}.` })
    .trim()
    .min(min, min <= 1 ? `Informe ${rotulo}.` : `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: no mínimo ${min} caracteres.`)
    .max(max, `Use no máximo ${max} caracteres.`)

/** Texto opcional: aparado; vazio vira null. */
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((v) => v || null)

export const esquemaCriarTarefa = z.object({
  titulo: texto(1, 200, 'o título'),
  descricao: opcional(2000),
  responsavel: opcional(100),
  prazo: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || ehDataIso(v), 'Informe um prazo válido (AAAA-MM-DD).'),
  coluna: z.enum(COLUNAS_TAREFA, { error: 'Coluna inválida.' }),
  contratoId: z
    .union([z.uuid({ error: 'Contrato inválido.' }), z.literal('')])
    .nullish()
    .transform((v) => v || null),
})
export type DadosCriarTarefa = z.infer<typeof esquemaCriarTarefa>

export const esquemaMoverTarefa = z.object({
  coluna: z.enum(COLUNAS_TAREFA, { error: 'Coluna inválida.' }),
})

export const esquemaRemoverTarefa = z.object({
  justificativa: texto(3, 500, 'a justificativa'),
})

export const esquemaListarTarefas = z.object({
  limiteConcluidas: z.coerce.number().int().min(1).max(500).default(LIMITE_CONCLUIDAS_PADRAO),
})
export type FiltroTarefas = z.infer<typeof esquemaListarTarefas>
