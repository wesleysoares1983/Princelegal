import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'
import { configEmail } from './config'

/**
 * Envio de e-mail.
 *
 * Com SMTP_HOST no .env: SMTP (relay do M365/Exchange ou qualquer servidor).
 * Sem ele: cada e-mail vira um arquivo .eml em `.dados/emails` -- abre no
 * Outlook/Thunderbird para conferir o conteúdo sem mandar nada a ninguém.
 */

export interface Email {
  para: string[]
  assunto: string
  texto: string
  html: string
}

export type ResultadoEnvio = { modo: 'smtp'; id: string } | { modo: 'arquivo'; caminho: string }

let transporte: Transporter | null = null

function smtp(): Transporter {
  const c = configEmail().smtp!
  transporte ??= nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.seguro,
    auth: c.usuario ? { user: c.usuario, pass: c.senha } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  return transporte
}

const paraArquivo = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })

export async function enviarEmail(email: Email): Promise<ResultadoEnvio> {
  const c = configEmail()
  const mensagem = { from: c.remetente, to: email.para.join(', '), subject: email.assunto, text: email.texto, html: email.html }

  if (c.smtp) {
    const info = await smtp().sendMail(mensagem)
    return { modo: 'smtp', id: info.messageId }
  }

  const info = (await paraArquivo.sendMail(mensagem)) as { message: Buffer }
  const pasta = resolve(c.pastaArquivos)
  await mkdir(pasta, { recursive: true })
  const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${email.assunto.replace(/[^\w-]+/g, '_').slice(0, 60)}.eml`
  const caminho = join(pasta, nome)
  await writeFile(caminho, info.message)
  return { modo: 'arquivo', caminho }
}

/** Escapa texto para HTML (nome de contrato, fornecedor, etc. vêm de quem digitou). */
export function html(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Conecta e autentica no SMTP, sem enviar nada. Erro = configuração ou rede. */
export async function verificarSmtp(): Promise<{ modo: 'smtp' | 'arquivo'; ok: true }> {
  if (!configEmail().smtp) return { modo: 'arquivo', ok: true }
  await smtp().verify()
  return { modo: 'smtp', ok: true }
}
