/**
 * Dados fictícios para DESENVOLVIMENTO: popula o banco do .env com contratos
 * em todos os status, aditivo, renovação, encerramento, documentos,
 * obrigações (em dia, atrasadas, cumpridas), tarefas no quadro e alertas já
 * enviados -- para apresentar o sistema.
 *
 *   npm run db:seed              recusa se já houver contratos no banco
 *   npm run db:seed -- --forcar  apaga todos os dados (menos as opções de
 *                                cadastro) e os arquivos enviados, e semeia de novo
 *
 * Passa pelos mesmos serviços das telas: auditoria, códigos e regras saem
 * iguais aos de um cadastro de verdade. Por isso NÃO há como desfazer pelo
 * sistema (a auditoria é só de inclusão): o --forcar desliga o gatilho da
 * auditoria só durante o TRUNCATE, na mesma transação.
 *
 * Nunca roda com NODE_ENV=production. Os e-mails de alerta vão para arquivos
 * .eml em .dados/emails (o SMTP do .env é ignorado aqui), e os destinatários
 * são endereços fictícios (@exemplo.com.br).
 */
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import type { DadosCriarContrato } from '@/lib/shared/contratos'
import { hojeSP, somarDias } from '@/lib/shared/datas'
import type { Recorrencia } from '@/lib/shared/obrigacoes'
import type { ColunaTarefa } from '@/lib/shared/tarefas'
import type { UsuarioSessao } from '@/lib/usuario'

if (existsSync('.env')) process.loadEnvFile('.env')
// Antes de qualquer leitura da configuração: alerta do seed nunca sai por SMTP.
process.env.SMTP_HOST = ''

const ADMIN: UsuarioSessao = { matricula: '900001', nome: 'Mariana Kowalski', email: 'mariana.kowalski@exemplo.com.br', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const GESTOR: UsuarioSessao = { matricula: '900002', nome: 'Rafael Andrade', email: 'rafael.andrade@exemplo.com.br', perfil: null, cargo: 'ADMIN', nivel: 'admin' }
const CTX = { ip: null, userAgent: 'seed de desenvolvimento' }

const GESTORES = [
  ['Rafael Andrade', 'rafael.andrade@exemplo.com.br'],
  ['Juliana Prado', 'juliana.prado@exemplo.com.br'],
  ['Eduardo Lemos', 'eduardo.lemos@exemplo.com.br'],
  ['Patrícia Nogueira', 'patricia.nogueira@exemplo.com.br'],
] as const
const JURIDICO = [
  ['Mariana Kowalski', 'mariana.kowalski@exemplo.com.br'],
  ['Thiago Ribeiro', 'thiago.ribeiro@exemplo.com.br'],
] as const

/** CNPJ válido a partir de 12 dígitos (os dígitos verificadores são calculados). */
function cnpj(base12: string): string {
  const dv = (s: string) => {
    const pesos = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = [...s].reduce((t, c, i) => t + (c.charCodeAt(0) - 48) * pesos[i], 0) % 11
    return r < 2 ? '0' : String(11 - r)
  }
  const d1 = dv(base12)
  return base12 + d1 + dv(base12 + d1)
}

/** PDF mínimo (uma página com o título): basta para listar, versionar e abrir no navegador. */
function pdf(titulo: string): { name: string; bytes: Uint8Array } {
  const texto = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[()\\]/g, '')
  const conteudo = `BT /F1 18 Tf 72 720 Td (${texto}) Tj 0 -28 Td /F1 11 Tf (Documento ficticio gerado para demonstracao.) Tj ET`
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let corpo = '%PDF-1.4\n'
  const deslocamentos: number[] = []
  objetos.forEach((o, i) => {
    deslocamentos.push(corpo.length)
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = corpo.length
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${deslocamentos.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('')}`
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const nome = `${texto.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.pdf`
  return { name: nome, bytes: new TextEncoder().encode(corpo) }
}

interface Modelo {
  nome: string
  categoria: string
  area: string
  fornecedor: string
  cnpjBase: string
  objeto: string
  /** Dias em relação a hoje. */
  inicio: number
  fim: number
  valor: number
  renovacaoAutomatica?: boolean
  prazoAviso?: number
  indice?: 'IPCA' | 'IGP-M' | 'INPC' | 'Fixo' | 'Outro'
  multa?: number
  restrito?: boolean
  pagamento?: string
  filial?: string
  pessoa?: number
  documento?: boolean
}

const MODELOS: Modelo[] = [
  { nome: 'Locação – Sede Administrativa', categoria: 'Aluguel', area: 'Administrativo', fornecedor: 'Imobiliária Campos Gerais Ltda', cnpjBase: '112223330001', objeto: 'Locação do imóvel da sede administrativa, 1.200 m², com 30 vagas de garagem.', inicio: -700, fim: 400, valor: 48500, renovacaoAutomatica: true, prazoAviso: 90, indice: 'IGP-M', multa: 145500, documento: true },
  { nome: 'Locação – Garagem Curitiba', categoria: 'Aluguel', area: 'Operações', fornecedor: 'Patrimonial Iguaçu S.A.', cnpjBase: '223334440001', objeto: 'Locação do pátio de estacionamento e manutenção de ônibus em Curitiba.', inicio: -300, fim: 75, valor: 36200, prazoAviso: 60, indice: 'IPCA', multa: 72400, filial: 'Curitiba', documento: true },
  { nome: 'Energia – Garagem Matriz', categoria: 'Energia', area: 'Operações', fornecedor: 'Comercializadora Paraná Energia Ltda', cnpjBase: '334445550001', objeto: 'Fornecimento de energia elétrica no mercado livre para a garagem matriz.', inicio: -340, fim: 20, valor: 27850.4, prazoAviso: 30, indice: 'IPCA', documento: true },
  { nome: 'Telecom – Links de dados', categoria: 'Telecom', area: 'TI', fornecedor: 'Rede Sul Telecomunicações Ltda', cnpjBase: '445556660001', objeto: 'Dois links de 1 Gbps (principal e redundante) entre matriz e filiais.', inicio: -500, fim: 5, valor: 9840, renovacaoAutomatica: true, prazoAviso: 60, indice: 'IGP-M', pessoa: 1 },
  { nome: 'Licenças – Pacote de escritório', categoria: 'Licença', area: 'TI', fornecedor: 'Softway Distribuidora de Software Ltda', cnpjBase: '556667770001', objeto: 'Assinatura anual de 180 licenças do pacote de escritório e e-mail.', inicio: -375, fim: -10, valor: 15300, indice: 'Fixo', pessoa: 1 },
  { nome: 'Seguro – Frota de ônibus', categoria: 'Seguro', area: 'Financeiro', fornecedor: 'Seguradora Planalto S.A.', cnpjBase: '667778880001', objeto: 'Seguro de responsabilidade civil e casco da frota (142 veículos).', inicio: -410, fim: -45, valor: 61200, prazoAviso: 30, indice: 'Fixo', pessoa: 3 },
  { nome: 'Limpeza e conservação – Rodoviárias', categoria: 'Prestação de Serviço', area: 'Operações', fornecedor: 'Conserva Mais Serviços Ltda', cnpjBase: '778889990001', objeto: 'Limpeza diária dos guichês e salas de embarque em 12 rodoviárias.', inicio: -200, fim: 165, valor: 54300, renovacaoAutomatica: true, prazoAviso: 45, indice: 'INPC', multa: 108600, pessoa: 2, documento: true },
  { nome: 'Assessoria jurídica trabalhista', categoria: 'Jurídico', area: 'Jurídico', fornecedor: 'Moraes & Albuquerque Advogados Associados', cnpjBase: '889990000001', objeto: 'Acompanhamento de reclamatórias trabalhistas e consultoria preventiva.', inicio: -90, fim: 640, valor: 18000, prazoAviso: 30, indice: 'IPCA', restrito: true, pessoa: 3 },
  { nome: 'Água e esgoto – Garagem Ponta Grossa', categoria: 'Água', area: 'Administrativo', fornecedor: 'Saneamento Campos Gerais S.A.', cnpjBase: '990001110001', objeto: 'Fornecimento de água e coleta de esgoto, com reúso para a lavagem de ônibus.', inicio: -150, fim: 580, valor: 4200, renovacaoAutomatica: true, prazoAviso: 30, indice: 'Outro' },
  { nome: 'Condomínio – Loja da Rodoviária', categoria: 'Condomínio', area: 'Financeiro', fornecedor: 'Condomínio Terminal Rodoviário Central', cnpjBase: '101112130001', objeto: 'Taxa condominial da loja de encomendas no terminal central.', inicio: -60, fim: 305, valor: 2650, prazoAviso: 30, indice: 'IGP-M', pessoa: 2 },
  { nome: 'Manutenção de ar-condicionado – Frota', categoria: 'Prestação de Serviço', area: 'Operações', fornecedor: 'Climabus Refrigeração Veicular Ltda', cnpjBase: '121314150001', objeto: 'Manutenção preventiva e corretiva dos aparelhos de ar-condicionado da frota.', inicio: -320, fim: 45, valor: 22400, renovacaoAutomatica: true, prazoAviso: 60, indice: 'IPCA', multa: 44800, pessoa: 2 },
  { nome: 'Sistema de vendas de passagens', categoria: 'Licença', area: 'TI', fornecedor: 'Rodosoft Tecnologia Ltda', cnpjBase: '131415160001', objeto: 'Licença e suporte do sistema de venda de passagens (guichê, site e aplicativo).', inicio: -420, fim: 310, valor: 32750, prazoAviso: 120, indice: 'IPCA', multa: 196500, pessoa: 1, documento: true },
  { nome: 'Benefício – Vale-alimentação', categoria: 'Prestação de Serviço', area: 'RH', fornecedor: 'Benefícios Brasil Administradora Ltda', cnpjBase: '141516170001', objeto: 'Administração do vale-alimentação dos colaboradores.', inicio: -230, fim: 135, valor: 3100, renovacaoAutomatica: true, prazoAviso: 30, indice: 'Fixo', pessoa: 3 },
  { nome: 'Vigilância patrimonial – Garagens', categoria: 'Prestação de Serviço', area: 'Administrativo', fornecedor: 'Guardião Segurança Patrimonial Ltda', cnpjBase: '151617180001', objeto: 'Vigilância 24h nas garagens de Ponta Grossa e Curitiba.', inicio: -100, fim: 995, valor: 41800, prazoAviso: 90, indice: 'INPC', multa: 125400 },
]

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:seed é só para desenvolvimento (NODE_ENV=production).')
    process.exit(1)
  }
  // Import depois do ajuste do SMTP: a configuração é lida (e memorizada) no primeiro uso.
  const { configArmazenamento, configBanco } = await import('@/lib/server/config')
  const { db, fecharBanco } = await import('@/lib/server/db/cliente')
  const { alertasEnviados, auditoria, contratoVigencias, contratos, documentoVersoes, documentos, obrigacoes, opcoesCadastro, tarefas } = await import(
    '@/lib/server/db/esquema'
  )
  const { validarArquivo } = await import('@/lib/server/http/upload')
  const { criarContrato, encerrarContrato } = await import('@/lib/server/servicos/contratos')
  const { registrarAditivo, renovarContrato } = await import('@/lib/server/servicos/aditivos')
  const { enviarDocumento } = await import('@/lib/server/servicos/documentos')
  const { criarObrigacao, cumprirObrigacao } = await import('@/lib/server/servicos/obrigacoes')
  const { executarAlertas } = await import('@/lib/server/servicos/alertas')
  const { criarTarefa, moverTarefa, removerTarefa } = await import('@/lib/server/servicos/tarefas')

  const banco = configBanco()
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(contratos)
  const forcar = process.argv.includes('--forcar')
  if (n > 0 && !forcar) {
    console.error(`O banco ${banco.host}/${banco.database} já tem ${n} contrato(s). Nada foi feito.\nPara apagar tudo e semear de novo: npm run db:seed -- --forcar`)
    await fecharBanco()
    process.exit(1)
  }
  if (forcar) {
    // Opções de cadastro ficam: o seed depende delas e quem mantém é o administrador.
    await db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE ${auditoria} DISABLE TRIGGER auditoria_sem_truncate`)
      await tx.execute(
        sql`TRUNCATE ${auditoria}, ${alertasEnviados}, ${tarefas}, ${obrigacoes}, ${documentoVersoes}, ${documentos}, ${contratoVigencias}, ${contratos} RESTART IDENTITY CASCADE`,
      )
      await tx.execute(sql`ALTER TABLE ${auditoria} ENABLE TRIGGER auditoria_sem_truncate`)
      await tx.execute(sql`ALTER SEQUENCE contrato_codigo_seq RESTART`)
    })
    await rm(resolve(configArmazenamento().diretorio, 'contratos'), { recursive: true, force: true })
    console.log(`Dados anteriores apagados (${n} contrato(s) e arquivos enviados).`)
  }
  console.log(`Semeando ${banco.host}/${banco.database}…`)

  const hoje = hojeSP()
  const em = (dias: number) => somarDias(hoje, dias)

  const opcoes = await db.select().from(opcoesCadastro)
  const opcao = (campo: string, valor?: string) => {
    const daqui = opcoes.filter((o) => o.campo === campo && o.ativo)
    const achada = daqui.find((o) => o.valor === valor) ?? daqui[0]
    if (!achada) throw new Error(`Nenhuma opção ativa em "${campo}": cadastre ao menos uma em Configurações.`)
    return achada.id
  }

  function dadosDe(m: Modelo, i: number): DadosCriarContrato {
    const [gestorNome, gestorEmail] = GESTORES[(m.pessoa ?? i) % GESTORES.length]
    const [juridicoNome, juridicoEmail] = JURIDICO[i % JURIDICO.length]
    return {
      nome: m.nome,
      categoriaId: opcao('categoria', m.categoria),
      segmentoId: opcao('segmento', i % 3 === 0 ? 'Prinex' : 'Passagens e Encomendas'),
      empresaId: opcao('empresa', i % 4 === 0 ? 'Paraná' : 'Princesa dos Campos'),
      filialId: opcao('filial', m.filial ?? 'Matriz'),
      areaResponsavelId: opcao('area-responsavel', m.area),
      centroCustoId: opcao('centro-custo', ['CC-1002', 'CC-2001', 'CC-3005'][i % 3]),
      fornecedorNome: m.fornecedor,
      fornecedorDocumento: cnpj(m.cnpjBase),
      fornecedorContato: `comercial@${m.fornecedor.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}.exemplo.com.br`,
      objeto: m.objeto,
      observacoes: null,
      gestorNome,
      gestorEmail,
      responsavelJuridicoNome: juridicoNome,
      responsavelJuridicoEmail: juridicoEmail,
      acessoRestrito: m.restrito ?? false,
      renovacaoAutomatica: m.renovacaoAutomatica ?? false,
      prazoAvisoCancelamentoDias: m.prazoAviso ?? 30,
      formaPagamento: m.pagamento ?? (i % 2 ? 'Boleto' : 'Transferência bancária'),
      indiceReajuste: m.indice ?? 'IPCA',
      dataBaseReajuste: em(m.inicio),
      multaRescisao: m.multa ?? null,
      dataInicio: em(m.inicio),
      dataFim: em(m.fim),
      valorMensal: m.valor,
      confirmarDuplicidade: true,
    }
  }

  const criados = new Map<string, { id: string; codigo: string; versao: number; restrito: boolean }>()
  for (const [i, m] of MODELOS.entries()) {
    const arquivo = m.documento ? validarArquivo(pdf(`Contrato - ${m.nome}`)) : undefined
    // Restrito: quem cadastra precisa enxergá-lo (admin ou envolvido) -- o fictício comum não é.
    const c = await criarContrato(m.restrito || i % 3 === 0 ? ADMIN : GESTOR, dadosDe(m, i), CTX, hoje, arquivo)
    criados.set(m.nome, { id: c.id, codigo: c.codigo, versao: c.versao, restrito: c.acessoRestrito })
    console.log(`  ${c.codigo}  ${c.avaliacao.rotulo.padEnd(26)} ${m.nome}`)
  }
  const pegar = (nome: string) => criados.get(nome)!

  // Aditivo: a garagem de Curitiba ganhou 6 meses e reajuste.
  {
    const c = pegar('Locação – Garagem Curitiba')
    const d = await registrarAditivo(GESTOR, c.id, { versao: c.versao, dataInicio: em(76), dataFim: em(255), valorMensal: 38150, observacao: 'Prorrogação por 6 meses com reajuste de 5,4% (IPCA).' }, CTX, hoje)
    await enviarDocumento(GESTOR, c.id, { arquivo: validarArquivo(pdf('1º Termo Aditivo - Garagem Curitiba')), tipo: 'Aditivo' }, CTX)
    console.log(`  ${d.codigo}  aditivo: término passa para ${d.dataFim}`)
  }

  // Renovação: o contrato antigo da vigilância vira histórico e nasce o novo.
  {
    const antigo = await criarContrato(ADMIN, { ...dadosDe(MODELOS[13], 13), nome: 'Monitoramento eletrônico – Filiais', fornecedorNome: 'Olho Vivo Monitoramento Ltda', fornecedorDocumento: cnpj('161718190001'), objeto: 'Monitoramento por câmeras e alarmes das lojas de encomendas.', dataInicio: em(-380), dataFim: em(-15), dataBaseReajuste: em(-380), valorMensal: 7600 }, CTX, hoje)
    const novo = await renovarContrato(ADMIN, antigo.id, { versao: antigo.versao, dataInicio: em(-14), dataFim: em(351), valorMensal: 7980 }, CTX, hoje, validarArquivo(pdf('Renovacao - Monitoramento eletronico')))
    console.log(`  ${antigo.codigo}  renovado por ${novo.codigo}`)
  }

  // Encerrado: a assessoria de marketing foi descontinuada.
  let encerradoId: string
  {
    const c = await criarContrato(GESTOR, { ...dadosDe(MODELOS[9], 9), nome: 'Agência de publicidade – Campanhas', categoriaId: opcao('categoria', 'Prestação de Serviço'), fornecedorNome: 'Criativa Comunicação Ltda', fornecedorDocumento: cnpj('171819200001'), objeto: 'Criação e veiculação das campanhas de temporada.', dataInicio: em(-260), dataFim: em(100), dataBaseReajuste: em(-260), valorMensal: 12500 }, CTX, hoje)
    await encerrarContrato(ADMIN, c.id, { versao: c.versao, data: em(-20), justificativa: 'Campanhas passaram a ser feitas pela equipe interna.' }, CTX, hoje)
    encerradoId = c.id
    console.log(`  ${c.codigo}  encerrado`)
  }

  // Anexos e parecer em contratos com documento.
  await enviarDocumento(ADMIN, pegar('Locação – Sede Administrativa').id, { arquivo: validarArquivo(pdf('Laudo de vistoria - Sede')), tipo: 'Anexo', nome: 'Laudo de vistoria de entrada' }, CTX)
  await enviarDocumento(ADMIN, pegar('Sistema de vendas de passagens').id, { arquivo: validarArquivo(pdf('Parecer juridico - Sistema de vendas')), tipo: 'Parecer jurídico' }, CTX)

  // Obrigações: pagamentos mensais (alguns já pagos, um atrasado), seguros, avisos.
  const obrigacao = async (contrato: string, descricao: string, responsavel: string, dias: number, recorrencia: Recorrencia, cumprir?: number) => {
    const quem = pegar(contrato).restrito ? ADMIN : GESTOR
    const { obrigacao: o } = await criarObrigacao(quem, pegar(contrato).id, { descricao, responsavel, data: em(dias), recorrencia }, CTX, hoje)
    if (cumprir !== undefined) await cumprirObrigacao(quem, o.id, { cumpridaEm: em(cumprir), observacao: 'Pago conforme boleto.' }, CTX, hoje)
  }
  await obrigacao('Locação – Sede Administrativa', 'Pagamento do aluguel', 'Financeiro', -25, 'Mensal', -27)
  await obrigacao('Locação – Sede Administrativa', 'Apresentar apólice de seguro-incêndio', 'Administrativo', 40, 'Anual')
  await obrigacao('Locação – Garagem Curitiba', 'Pagamento do aluguel', 'Financeiro', -4, 'Mensal')
  await obrigacao('Energia – Garagem Matriz', 'Conferir medição e fatura', 'Operações', 6, 'Mensal')
  await obrigacao('Energia – Garagem Matriz', 'Decidir renovação ou nova cotação no mercado livre', 'Juliana Prado', 10, 'Única')
  await obrigacao('Telecom – Links de dados', 'Enviar aviso de não renovação, se for o caso', 'TI', -2, 'Única')
  await obrigacao('Limpeza e conservação – Rodoviárias', 'Conferir relatório mensal de execução', 'Operações', -12, 'Mensal', -10)
  await obrigacao('Limpeza e conservação – Rodoviárias', 'Exigir comprovantes de FGTS e INSS dos funcionários', 'Jurídico', 15, 'Mensal')
  await obrigacao('Sistema de vendas de passagens', 'Reunião trimestral de nível de serviço', 'TI', 22, 'Por evento')
  await obrigacao('Vigilância patrimonial – Garagens', 'Renovação da apólice de responsabilidade civil', 'Administrativo', 60, 'Anual')
  await obrigacao('Assessoria jurídica trabalhista', 'Relatório mensal de processos', 'Thiago Ribeiro', -8, 'Mensal')

  // Tarefas: avulsas e vinculadas (inclusive ao restrito e ao encerrado), em todas as colunas,
  // algumas com o caminho percorrido (mover) e uma excluída -- tudo aparece na Auditoria.
  const tarefa = async (
    titulo: string,
    extra: { descricao?: string; responsavel?: string; prazo?: number; contratoId?: string; mover?: ColunaTarefa[]; excluir?: string } = {},
  ) => {
    const quem = extra.contratoId === pegar('Assessoria jurídica trabalhista').id ? ADMIN : GESTOR
    const t = await criarTarefa(
      quem,
      {
        titulo,
        descricao: extra.descricao ?? null,
        responsavel: extra.responsavel ?? null,
        prazo: extra.prazo === undefined ? null : em(extra.prazo),
        coluna: 'A fazer',
        contratoId: extra.contratoId ?? null,
      },
      CTX,
      hoje,
    )
    for (const coluna of extra.mover ?? []) await moverTarefa(quem, t.id, coluna, CTX, hoje)
    if (extra.excluir) await removerTarefa(quem, t.id, extra.excluir, CTX)
  }
  await tarefa('Revisar minuta do novo contrato de vigilância', {
    descricao: 'Conferir cláusulas de reajuste e multa antes da assinatura.',
    responsavel: 'Mariana Kowalski',
    prazo: 7,
    contratoId: pegar('Vigilância patrimonial – Garagens').id,
  })
  await tarefa('Levantar contratos sem documento assinado', { responsavel: 'Thiago Ribeiro', prazo: 20 })
  await tarefa('Cotar nova fornecedora de energia', {
    descricao: 'Pedir ao menos três propostas no mercado livre.',
    responsavel: 'Juliana Prado',
    prazo: -3,
    contratoId: pegar('Energia – Garagem Matriz').id,
  })
  await tarefa('Atualizar modelo padrão de aditivo', { responsavel: 'Jurídico' })
  await tarefa('Negociar reajuste do aluguel da sede', {
    descricao: 'Proposta do locador: IGP-M cheio. Contraproposta: IPCA.',
    responsavel: 'Rafael Andrade',
    prazo: 30,
    contratoId: pegar('Locação – Sede Administrativa').id,
    mover: ['Em andamento'],
  })
  await tarefa('Preparar defesa – reclamatória 0001234-56', {
    responsavel: 'Thiago Ribeiro',
    prazo: 12,
    contratoId: pegar('Assessoria jurídica trabalhista').id,
    mover: ['Em andamento'],
  })
  await tarefa('Treinamento de gestores sobre prazos de aviso', { responsavel: 'Patrícia Nogueira', prazo: -1, mover: ['Em andamento'] })
  await tarefa('Arquivar documentos da agência de publicidade', {
    responsavel: 'Administrativo',
    contratoId: encerradoId,
    mover: ['Em andamento', 'Concluída'],
  })
  await tarefa('Enviar aviso de não renovação dos links de dados', {
    responsavel: 'Eduardo Lemos',
    contratoId: pegar('Telecom – Links de dados').id,
    mover: ['Concluída'],
  })
  await tarefa('Conferir certidões negativas da limpeza', {
    responsavel: 'Jurídico',
    contratoId: pegar('Limpeza e conservação – Rodoviárias').id,
    mover: ['Em andamento', 'Concluída', 'Em andamento'],
  })
  await tarefa('Revisar contrato de telecom', { excluir: 'Duplicada de "Enviar aviso de não renovação dos links de dados".' })
  console.log('  tarefas: 10 no quadro (e 1 excluída, só na auditoria)')

  // Alertas: o envio de hoje, como o worker faria às 07:00 (em arquivos .eml).
  const alertas = await executarAlertas({ hoje })
  console.log(`  alertas: ${alertas.enviados.length} e-mail(s) gravados em .dados/emails (modo ${alertas.modo})`)

  await fecharBanco()
  console.log(`\nPronto: ${criados.size + 3} contratos. Entre no sistema como administrador para ver todos (há um restrito).`)
}

main().catch((erro) => {
  console.error('seed falhou:', erro instanceof Error ? (erro.stack ?? erro.message) : erro)
  process.exit(1)
})
