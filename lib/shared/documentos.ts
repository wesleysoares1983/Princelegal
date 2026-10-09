import { z } from 'zod'
import type { Carimbo } from './contratos'

/** Documentos do contrato: o que cliente e servidor compartilham. */

export const TIPOS_DOCUMENTO = ['Contrato', 'Aditivo', 'Renovação', 'Anexo', 'Comprovante', 'Parecer jurídico'] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

/** Para o `accept` do input e a checagem rapida no navegador; quem decide de verdade e o servidor (pelo conteudo). */
export const EXTENSOES_ACEITAS = ['.pdf', '.doc', '.docx'] as const

export interface VersaoDocumento {
  versao: number
  nomeArquivo: string
  mime: string
  tamanhoBytes: number
  enviadoEm: string
  enviadoPor: Carimbo
}

export interface Documento {
  id: string
  contratoId: string
  tipo: TipoDocumento
  nome: string
  versaoAtual: number
  /** Metadados do arquivo da versao atual. */
  atual: VersaoDocumento
  /** So com `incluirVersoes=true`; da mais nova para a mais antiga. */
  versoes?: VersaoDocumento[]
  /** Preenchido quando removido (so administrador lista removidos). */
  removido: { em: string; por: Carimbo | null; motivo: string | null } | null
}

export const esquemaTipoDocumento = z.enum(TIPOS_DOCUMENTO, { error: 'Selecione o tipo do documento.' })

export const esquemaNomeDocumento = z
  .string()
  .trim()
  .max(200, 'Use no máximo 200 caracteres.')
  .optional()
  .transform((v) => v || undefined)

export const esquemaRemoverDocumento = z.object({
  motivo: z
    .string({ error: 'Informe o motivo.' })
    .trim()
    .min(3, 'Motivo: no mínimo 3 caracteres.')
    .max(500, 'Use no máximo 500 caracteres.'),
})

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
