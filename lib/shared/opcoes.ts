import { z } from 'zod'

/**
 * Opcoes de cadastro (Categoria, Segmento, Empresa, Filial, Centro de Custo,
 * Area Responsavel): o que cliente e servidor compartilham -- campos, rotulos,
 * regras de validacao e o formato da resposta da API.
 */

export const CAMPOS_OPCAO = ['categoria', 'segmento', 'empresa', 'filial', 'centro-custo', 'area-responsavel'] as const
export type CampoOpcao = (typeof CAMPOS_OPCAO)[number]

export const TITULO_CAMPO: Record<CampoOpcao, string> = {
  categoria: 'Categoria',
  segmento: 'Segmento',
  empresa: 'Empresa',
  filial: 'Filial',
  'centro-custo': 'Centro de Custo',
  'area-responsavel': 'Área Responsável',
}

/** Uma opcao como a API devolve. */
export interface Opcao {
  id: string
  campo: CampoOpcao
  valor: string
  ativo: boolean
  ordem: number
  versao: number
  /** Quantos contratos usam a opcao -- so nas respostas para administrador. */
  emUso?: number
}

/** GET /api/v1/opcoes-cadastro: todos os campos, mesmo os sem opcao. */
export type OpcoesPorCampo = Record<CampoOpcao, Opcao[]>

const valor = z
  .string({ error: 'Informe o valor.' })
  .trim()
  .min(1, 'Informe o valor.')
  .max(100, 'Use no máximo 100 caracteres.')

export const esquemaCriarOpcao = z.object({
  campo: z.enum(CAMPOS_OPCAO, { error: 'Campo inválido.' }),
  valor,
})
export type DadosCriarOpcao = z.infer<typeof esquemaCriarOpcao>

export const esquemaEditarOpcao = z
  .object({
    versao: z.number({ error: 'Informe a versão lida.' }).int().positive(),
    valor: valor.optional(),
    ordem: z.number({ error: 'Ordem inválida.' }).int().min(0).max(10_000).optional(),
  })
  .refine((d) => d.valor !== undefined || d.ordem !== undefined, { error: 'Nada para alterar.', path: ['valor'] })
export type DadosEditarOpcao = z.infer<typeof esquemaEditarOpcao>

export const esquemaListarOpcoes = z.object({
  campo: z.enum(CAMPOS_OPCAO, { error: 'Campo inválido.' }).optional(),
  incluirInativas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})
