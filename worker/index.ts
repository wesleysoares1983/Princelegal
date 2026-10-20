/**
 * Worker: tarefas agendadas, fora do processo web (docs/BACKEND_IMPLEMENTATION.md §9).
 *
 * - Alertas por e-mail: todo dia às 07:00 (ALERTAS_CRON), horário de Brasília.
 * - Limpeza de arquivos órfãos: domingo às 03:00.
 * - Contratos do Protheus: todo dia às 09:00 (PROTHEUS_CRON), e na subida se
 *   ainda não houver cache ou se a última sincronização falhou.
 *
 * Uso (depois de `npm run worker:build`):
 *   node dist/worker.cjs                      fica rodando com o agendamento
 *   node dist/worker.cjs alertas [--simular]  roda os alertas uma vez e sai
 *   node dist/worker.cjs limpar               roda a limpeza uma vez e sai
 *   node dist/worker.cjs protheus             sincroniza os contratos do Protheus e sai
 *   node dist/worker.cjs verificar-email      conecta/autentica no SMTP, sem enviar
 *   node dist/worker.cjs teste-email <para>   manda um e-mail de teste para <para>
 *
 * Cada execução de alertas trava no banco (advisory lock): duas instâncias, ou
 * o worker e o botão do administrador, nunca enviam em dobro.
 */
import { existsSync } from 'node:fs'
import cron from 'node-cron'
import { configAlertas, configArmazenamento, configBanco, configEmail, configProtheus } from '@/lib/server/config'
import { verificarPastaGravavel } from '@/lib/server/armazenamento'
import { fecharBanco } from '@/lib/server/db/cliente'
import { enviarEmail, verificarSmtp } from '@/lib/server/email'
import { log } from '@/lib/server/log'
import { executarAlertas } from '@/lib/server/servicos/alertas'
import { limparArquivosOrfaos } from '@/lib/server/servicos/documentos'
import { lerCacheContratosProtheus, sincronizarContratosProtheus } from '@/lib/server/servicos/protheus'

const FUSO = 'America/Sao_Paulo'

if (existsSync('.env')) process.loadEnvFile('.env')

// Confere só o que o worker usa (não precisa de Apps Princesa nem de sessão).
configBanco()
configArmazenamento()
configEmail()
const alertas = configAlertas()
const protheus = configProtheus()

async function rodarAlertas(simular = false) {
  try {
    const r = await executarAlertas({ simular })
    if (r.emAndamento) log.warn('alertas: outra execução em andamento; esta foi pulada')
    return r
  } catch (erro) {
    log.error({ err: erro }, 'alertas: execução falhou')
    return null
  }
}

async function rodarLimpeza() {
  try {
    const n = await limparArquivosOrfaos()
    log.info({ apagados: n }, 'limpeza de arquivos órfãos concluída')
  } catch (erro) {
    log.error({ err: erro }, 'limpeza de arquivos órfãos falhou')
  }
}

/** Falha do Protheus não lança: fica registrada em `erro` no cache (a tela mostra os dados anteriores). */
async function rodarProtheus() {
  try {
    const r = await sincronizarContratosProtheus()
    if (r.erro) log.warn({ erro: r.erro }, 'protheus: sincronização falhou')
    else log.info({ contratos: r.contratos.length }, 'protheus: sincronização concluída')
    return !r.erro
  } catch (erro) {
    log.error({ err: erro }, 'protheus: não foi possível gravar o cache')
    return false
  }
}

async function main() {
  const [comando, opcao] = process.argv.slice(2)
  if (!comando || comando === 'limpar') await verificarPastaGravavel()

  if (comando === 'alertas') {
    const r = await rodarAlertas(opcao === '--simular')
    console.log(JSON.stringify(r, null, 2))
    await fecharBanco()
    process.exit(r ? 0 : 1)
  }
  if (comando === 'verificar-email') {
    try {
      const r = await verificarSmtp()
      console.log(r.modo === 'smtp' ? `SMTP ok: ${configEmail().smtp!.host}:${configEmail().smtp!.port}` : 'Sem SMTP_HOST: e-mails vão para arquivos .eml')
      process.exit(0)
    } catch (erro) {
      console.error('SMTP falhou:', erro instanceof Error ? erro.message : erro)
      process.exit(1)
    }
  }
  if (comando === 'teste-email') {
    if (!opcao) {
      console.error('uso: node dist/worker.cjs teste-email <endereço>')
      process.exit(2)
    }
    const r = await enviarEmail({
      para: [opcao],
      assunto: '[Contratos] E-mail de teste',
      texto: `Teste de envio do sistema Contratos Jurídicos (${new Date().toISOString()}). Se você recebeu, os alertas por e-mail estão configurados.`,
      html: '<p>Teste de envio do sistema <strong>Contratos Jurídicos</strong>. Se você recebeu, os alertas por e-mail estão configurados.</p>',
    })
    console.log(r.modo === 'smtp' ? `Enviado via SMTP (${r.id})` : `Gravado em ${r.caminho}`)
    await fecharBanco()
    return
  }
  if (comando === 'limpar') {
    await rodarLimpeza()
    await fecharBanco()
    return
  }
  if (comando === 'protheus') {
    const ok = await rodarProtheus()
    await fecharBanco()
    process.exit(ok ? 0 : 1)
  }

  const tarefas = [
    cron.schedule('0 3 * * 0', rodarLimpeza, { timezone: FUSO, name: 'limpeza', noOverlap: true }),
    cron.schedule(protheus.cron, () => void rodarProtheus(), { timezone: FUSO, name: 'protheus', noOverlap: true }),
  ]
  if (alertas.ativos) {
    tarefas.push(cron.schedule(alertas.cron, () => void rodarAlertas(), { timezone: FUSO, name: 'alertas', noOverlap: true }))
  } else {
    log.warn('ALERTAS_ATIVOS=false: e-mails de alerta desligados neste ambiente')
  }
  log.info(
    {
      alertas: alertas.ativos ? alertas.cron : 'desligados',
      protheus: protheus.conexao ? protheus.cron : 'sem PROTHEUS_CONTRACTS_TOKEN',
      modoEmail: configEmail().smtp ? 'smtp' : 'arquivo',
    },
    'worker iniciado',
  )

  // Primeiro deploy (sem cache) ou falha anterior (ex.: token corrigido no .env):
  // não espera o próximo horário agendado.
  const cache = await lerCacheContratosProtheus()
  if (!cache || cache.erro) void rodarProtheus()

  const parar = async (sinal: string) => {
    log.info({ sinal }, 'worker parando')
    for (const t of tarefas) await t.stop()
    await fecharBanco()
    process.exit(0)
  }
  process.on('SIGTERM', () => void parar('SIGTERM'))
  process.on('SIGINT', () => void parar('SIGINT'))
}

void main()
