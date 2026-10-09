import 'server-only'
import { aliasedTable, and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm'
import { CAMPOS_FORA_DA_EDICAO } from '@/lib/shared/contratos'
import type {
  Carimbo,
  ContratoDetalhe,
  ContratoResumo,
  DadosCriarContrato,
  DadosEditarContrato,
  DadosEncerrar,
  DadosReabrir,
  EventoAuditoria,
  FiltroContratos,
  OpcaoRef,
  Paginado,
  Vigencia,
} from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import { formatarDocumento, normalizarDocumento } from '@/lib/shared/documentoFiscal'
import { TITULO_CAMPO, type CampoOpcao } from '@/lib/shared/opcoes'
import { avaliar, dataLimiteAviso, formatarData, formatarMoeda, proximoReajuste } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { comGravacao, type Gravacao } from '../armazenamento'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { ehAdmin, exigirAdmin } from '../auth'
import { db, type Executor } from '../db/cliente'
import {
  padraoBusca,
  sqlDecisaoUrgente,
  sqlDiasVencimento,
  sqlStatus,
  sqlVisivel,
  textoBusca,
} from '../db/consultas/contratos'
import { auditoria, contratos, contratoVigencias, documentos, opcoesCadastro } from '../db/esquema'
import {
  ErroApi,
  erroConflito,
  erroNaoEncontrado,
  erroRegraNegocio,
  erroSemPermissao,
  erroValidacao,
} from '../http/erros'
import type { ArquivoValidado } from '../http/upload'
import { continuariaVendo, ehEnvolvido, permissoesDoContrato, podeVer } from '../permissoes'
import { inserirDocumento } from './documentos'
import { aoEncerrar, aoReabrir } from './obrigacoes'

/**
 * Contratos -- regras de negocio (docs/BACKEND_IMPLEMENTATION.md §7, §8.2–8.5).
 *
 * - Restrito invisivel = 404, nunca 403 (nao revelar que existe).
 * - Vigencia (inicio/fim) e valor so mudam por aditivo; o resto edita com
 *   trava de versao e diff campo a campo na auditoria.
 * - Encerrado e somente leitura; encerrar e reabrir sao de administrador.
 * - Status nunca e guardado: `avaliar()` na resposta, `sqlStatus()` nos filtros.
 */

export type Linha = typeof contratos.$inferSelect

// ---------------------------------------------------------------- conversoes

const numero = (v: string) => Number(v)
const numeroOuNulo = (v: string | null) => (v === null ? null : Number(v))
const dinheiroDb = (v: number) => v.toFixed(2)

/** Instante do banco ("2026-10-09 13:00:00.123+00" ou Date) -> ISO. */
export function isoInstante(v: string | Date): string {
  if (v instanceof Date) return v.toISOString()
  return new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString()
}

const carimbo = (matricula: string | null, nome: string | null): Carimbo | null =>
  matricula ? { matricula, nome: nome ?? matricula } : null

const carimboDe = (usuario: UsuarioSessao) => ({ matricula: usuario.matricula, nome: usuario.nome })

function avaliacaoDe(l: Pick<Linha, 'dataFim' | 'prazoAvisoCancelamentoDias' | 'encerradoEm' | 'motivoEncerramento'>, hoje: string, sucessor?: string | null) {
  return avaliar({ ...l, renovadoPorCodigo: sucessor ?? null }, hoje)
}

// ---------------------------------------------------------------- leitura: lista

const categoria = aliasedTable(opcoesCadastro, 'categoria')
const area = aliasedTable(opcoesCadastro, 'area')
const sucessor = aliasedTable(contratos, 'sucessor')

/** Colunas de um ContratoResumo (com os nomes das opcoes e o codigo do sucessor). */
const colunasResumo = {
  c: contratos,
  categoria: categoria.valor,
  area: area.valor,
  sucessorCodigo: sucessor.codigo,
}

function consultaResumo(ex: Executor) {
  return ex
    .select(colunasResumo)
    .from(contratos)
    .innerJoin(categoria, eq(categoria.id, contratos.categoriaId))
    .innerJoin(area, eq(area.id, contratos.areaResponsavelId))
    .leftJoin(sucessor, eq(sucessor.id, contratos.renovadoPorContratoId))
}

interface LinhaResumo {
  c: Linha
  categoria: string
  area: string
  sucessorCodigo: string | null
}

export function paraResumo(r: LinhaResumo, hoje: string): ContratoResumo {
  const c = r.c
  return {
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    categoria: r.categoria,
    areaResponsavel: r.area,
    fornecedorNome: c.fornecedorNome,
    fornecedorDocumento: formatarDocumento(c.fornecedorDocumento),
    gestorNome: c.gestorNome,
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    valorMensal: numero(c.valorMensal),
    renovacaoAutomatica: c.renovacaoAutomatica,
    acessoRestrito: c.acessoRestrito,
    avaliacao: avaliacaoDe(c, hoje, r.sucessorCodigo),
  }
}

/** Condicoes comuns: visibilidade + filtros da lista. */
export function filtrosContratos(usuario: UsuarioSessao, f: Partial<FiltroContratos>, hoje: string): SQL[] {
  const condicoes: SQL[] = [sqlVisivel(usuario)]
  const status = f.status ?? 'todos'
  if (status === 'ativos') condicoes.push(isNull(contratos.encerradoEm))
  else if (status !== 'todos') condicoes.push(sql`${sqlStatus(hoje)} = ${status}`)
  if (f.renovacaoAutomatica === 'sim') condicoes.push(eq(contratos.renovacaoAutomatica, true))

  if (f.busca) {
    // Cada palavra precisa aparecer (em qualquer ordem): "locacao curit" acha
    // "Locação – Unidade Curitiba". Palavra com digito tambem casa com o CNPJ/CPF,
    // digitado com ou sem pontuacao.
    for (const palavra of f.busca.split(/\s+/).filter(Boolean).slice(0, 8)) {
      const doc = normalizarDocumento(palavra)
      const porDocumento = doc.length >= 3 && /\d/.test(doc) ? sql` or ${contratos.fornecedorDocumento} like ${`%${doc}%`}` : sql``
      // Area tambem entra (a tela promete "nome, código, razão social ou área").
      condicoes.push(
        sql`(${textoBusca} like ${padraoBusca(palavra)} or lower(f_unaccent(${area.valor})) like ${padraoBusca(palavra)}${porDocumento})`,
      )
    }
  }
  const porOpcao = [
    [f.categoriaId, contratos.categoriaId],
    [f.segmentoId, contratos.segmentoId],
    [f.empresaId, contratos.empresaId],
    [f.filialId, contratos.filialId],
    [f.areaResponsavelId, contratos.areaResponsavelId],
    [f.centroCustoId, contratos.centroCustoId],
  ] as const
  for (const [valor, coluna] of porOpcao) if (valor) condicoes.push(eq(coluna, valor))

  if (f.envolvido === 'eu') {
    const email = usuario.email.trim().toLowerCase()
    condicoes.push(sql`(${contratos.gestorEmail} = ${email} or ${contratos.responsavelJuridicoEmail} = ${email})`)
  }
  return condicoes
}

const ORDENACAO: Record<FiltroContratos['ordenar'], SQL[]> = {
  // Abertos primeiro, do vencimento mais proximo (ou ja vencido) para o mais distante.
  vencimento: [sql`(${contratos.encerradoEm} is not null)`, asc(contratos.dataFim), asc(contratos.codigo)],
  nome: [sql`lower(f_unaccent(${contratos.nome}))`, asc(contratos.codigo)],
  codigo: [asc(contratos.codigo)],
  valor: [asc(contratos.valorMensal), asc(contratos.codigo)],
  '-valor': [desc(contratos.valorMensal), asc(contratos.codigo)],
}

export async function listarContratos(
  usuario: UsuarioSessao,
  f: FiltroContratos,
  hoje: string = hojeSP(),
): Promise<Paginado<ContratoResumo>> {
  const onde = and(...filtrosContratos(usuario, f, hoje))
  const [linhas, [{ total }]] = await Promise.all([
    consultaResumo(db)
      .where(onde)
      .orderBy(...ORDENACAO[f.ordenar])
      .limit(f.porPagina)
      .offset((f.pagina - 1) * f.porPagina),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contratos)
      .innerJoin(area, eq(area.id, contratos.areaResponsavelId))
      .where(onde),
  ])
  return { itens: linhas.map((l) => paraResumo(l, hoje)), total, pagina: f.pagina, porPagina: f.porPagina }
}

// ---------------------------------------------------------------- leitura: detalhe

/** Le o contrato (opcionalmente travando a linha) e aplica a visibilidade: 404 se nao pode ver. */
export async function carregar(ex: Executor, usuario: UsuarioSessao, id: string, travar = false): Promise<Linha> {
  const consulta = ex.select().from(contratos).where(eq(contratos.id, id))
  const [linha] = travar ? await consulta.for('update') : await consulta
  if (!linha || !podeVer(usuario, linha)) throw erroNaoEncontrado('Contrato não encontrado.')
  return linha
}

export async function montarDetalhe(ex: Executor, usuario: UsuarioSessao, c: Linha, hoje: string): Promise<ContratoDetalhe> {
  const idsOpcoes = [c.categoriaId, c.segmentoId, c.empresaId, c.filialId, c.areaResponsavelId, c.centroCustoId]
  const idsVizinhos = [c.renovaContratoId, c.renovadoPorContratoId].filter((v): v is string => v !== null)

  const [opcoes, vizinhos, vigencias] = await Promise.all([
    ex.select().from(opcoesCadastro).where(inArray(opcoesCadastro.id, idsOpcoes)),
    idsVizinhos.length
      ? ex.select({ id: contratos.id, codigo: contratos.codigo }).from(contratos).where(inArray(contratos.id, idsVizinhos))
      : Promise.resolve([]),
    ex
      .select({ v: contratoVigencias, documentoNome: documentos.nome, documentoRemovidoEm: documentos.removidoEm })
      .from(contratoVigencias)
      .leftJoin(documentos, eq(documentos.id, contratoVigencias.documentoId))
      .where(eq(contratoVigencias.contratoId, c.id))
      .orderBy(asc(contratoVigencias.criadoEm), sql`${contratoVigencias.numero} asc nulls first`),
  ])

  // So o ultimo registro valido, se for aditivo, pode ser anulado -- por admin, com o contrato aberto.
  const ultimoValido = [...vigencias].reverse().find((r) => r.v.anuladoEm === null)?.v
  const aditivoAnulavel = ehAdmin(usuario) && c.encerradoEm === null && ultimoValido?.tipo === 'Aditivo' ? ultimoValido.id : null

  const ref = (id: string): OpcaoRef => {
    const o = opcoes.find((x) => x.id === id)!
    return { id: o.id, valor: o.valor, ativo: o.ativo }
  }
  const vizinho = (id: string | null) => (id ? (vizinhos.find((v) => v.id === id) ?? null) : null)
  const renovadoPor = vizinho(c.renovadoPorContratoId)
  const valorMensal = numero(c.valorMensal)

  return {
    id: c.id,
    codigo: c.codigo,
    versao: c.versao,
    nome: c.nome,
    categoria: ref(c.categoriaId),
    segmento: ref(c.segmentoId),
    empresa: ref(c.empresaId),
    filial: ref(c.filialId),
    areaResponsavel: ref(c.areaResponsavelId),
    centroCusto: ref(c.centroCustoId),
    fornecedorNome: c.fornecedorNome,
    fornecedorDocumento: formatarDocumento(c.fornecedorDocumento),
    fornecedorContato: c.fornecedorContato,
    objeto: c.objeto,
    observacoes: c.observacoes,
    gestorNome: c.gestorNome,
    gestorEmail: c.gestorEmail,
    responsavelJuridicoNome: c.responsavelJuridicoNome,
    responsavelJuridicoEmail: c.responsavelJuridicoEmail,
    acessoRestrito: c.acessoRestrito,
    dataInicio: c.dataInicio,
    dataFim: c.dataFim,
    dataLimiteAviso: dataLimiteAviso(c.dataFim, c.prazoAvisoCancelamentoDias),
    renovacaoAutomatica: c.renovacaoAutomatica,
    prazoAvisoCancelamentoDias: c.prazoAvisoCancelamentoDias,
    valorMensal,
    valorAnual: Math.round(valorMensal * 12 * 100) / 100,
    formaPagamento: c.formaPagamento,
    indiceReajuste: c.indiceReajuste,
    dataBaseReajuste: c.dataBaseReajuste,
    proximoReajuste: proximoReajuste(c.dataBaseReajuste, hoje),
    multaRescisao: numeroOuNulo(c.multaRescisao),
    acaoVencimento:
      c.acaoVencimento && c.responsavelAcao && c.prazoAcao && c.statusAcao
        ? { acao: c.acaoVencimento, responsavel: c.responsavelAcao, prazo: c.prazoAcao, status: c.statusAcao }
        : null,
    encerramento:
      c.encerradoEm && c.motivoEncerramento
        ? {
            data: c.encerradoEm,
            motivo: c.motivoEncerramento,
            justificativa: c.justificativaEncerramento,
            por: carimbo(c.encerradoPorMatricula, c.encerradoPorNome),
          }
        : null,
    renova: vizinho(c.renovaContratoId),
    renovadoPor,
    avaliacao: avaliacaoDe(c, hoje, renovadoPor?.codigo),
    historico: vigencias.map(
      ({ v, documentoNome, documentoRemovidoEm }): Vigencia => ({
        id: v.id,
        tipo: v.tipo,
        numero: v.numero,
        dataInicio: v.dataInicio,
        dataFim: v.dataFim,
        valorMensal: numero(v.valorMensal),
        observacao: v.observacao,
        anulado: v.anuladoEm !== null,
        anulavel: v.id === aditivoAnulavel,
        justificativaAnulacao: v.justificativaAnulacao,
        documento: v.documentoId && documentoNome ? { id: v.documentoId, nome: documentoNome, removido: documentoRemovidoEm !== null } : null,
        criadoPor: { matricula: v.criadoPorMatricula, nome: v.criadoPorNome },
        criadoEm: isoInstante(v.criadoEm),
      }),
    ),
    permissoes: permissoesDoContrato(usuario, c),
    criadoPor: { matricula: c.criadoPorMatricula, nome: c.criadoPorNome },
    criadoEm: isoInstante(c.criadoEm),
    atualizadoEm: isoInstante(c.atualizadoEm),
  }
}

export async function obterContrato(
  usuario: UsuarioSessao,
  id: string,
  contexto?: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<ContratoDetalhe> {
  const c = await carregar(db, usuario, id)
  if (c.acessoRestrito && contexto) await registrarVisualizacaoRestrita(usuario, c, contexto)
  return montarDetalhe(db, usuario, c, hoje)
}

/** Trilha LGPD de quem abriu contrato restrito: no maximo uma linha por pessoa e contrato por hora. */
async function registrarVisualizacaoRestrita(usuario: UsuarioSessao, c: Linha, contexto: ContextoAuditoria) {
  const [recente] = await db
    .select({ id: auditoria.id })
    .from(auditoria)
    .where(
      and(
        eq(auditoria.contratoId, c.id),
        eq(auditoria.acao, 'contrato.visualizado'),
        eq(auditoria.usuarioMatricula, usuario.matricula),
        sql`${auditoria.ocorridoEm} > now() - interval '1 hour'`,
      ),
    )
    .limit(1)
  if (recente) return
  await registrarAuditoria(
    db,
    {
      usuario: carimboDe(usuario),
      categoria: 'acesso',
      acao: 'contrato.visualizado',
      descricao: 'Visualizou o contrato restrito',
      contratoId: c.id,
    },
    contexto,
  )
}

// ---------------------------------------------------------------- escrita: apoio

const CAMPO_DA_OPCAO = {
  categoriaId: 'categoria',
  segmentoId: 'segmento',
  empresaId: 'empresa',
  filialId: 'filial',
  areaResponsavelId: 'area-responsavel',
  centroCustoId: 'centro-custo',
} as const satisfies Record<string, CampoOpcao>
export type ChaveOpcao = keyof typeof CAMPO_DA_OPCAO

/**
 * Cada id precisa ser uma opcao do campo certo e ativa -- exceto a que o
 * contrato ja usa (opcao desativada depois continua valendo nele).
 */
async function validarOpcoes(ex: Executor, dados: object, atuais: Partial<Record<ChaveOpcao, string>> = {}) {
  // So as seis chaves de opcao, venha o que vier (o formulario inteiro, um PATCH parcial).
  const escolhidas = Object.fromEntries(
    Object.entries(dados).filter(([k, v]) => k in CAMPO_DA_OPCAO && typeof v === 'string'),
  ) as Partial<Record<ChaveOpcao, string>>
  const ids = Object.values(escolhidas).filter((v): v is string => !!v)
  if (!ids.length) return new Map<string, string>()
  const linhas = await ex.select().from(opcoesCadastro).where(inArray(opcoesCadastro.id, ids))
  const campos: Record<string, string> = {}
  for (const [chave, id] of Object.entries(escolhidas) as [ChaveOpcao, string | undefined][]) {
    if (!id) continue
    const campo = CAMPO_DA_OPCAO[chave]
    const o = linhas.find((l) => l.id === id)
    if (!o || o.campo !== campo) campos[chave] = `Selecione uma opção válida de ${TITULO_CAMPO[campo]}.`
    else if (!o.ativo && atuais[chave] !== id) campos[chave] = `“${o.valor}” foi desativada em ${TITULO_CAMPO[campo]}; escolha outra.`
  }
  if (Object.keys(campos).length) throw erroValidacao(campos)
  return new Map(linhas.map((l) => [l.id, l.valor]))
}

export function mensagemTrancado(usuario: UsuarioSessao) {
  return erroRegraNegocio(
    `Com acesso restrito, só administradores, o gestor e o responsável jurídico veem o contrato — e o seu e-mail (${usuario.email}) não é nenhum dos dois. ` +
      'Confira os e-mails digitados ou deixe o contrato sem restrição.',
  )
}

async function proximoCodigo(ex: Executor, dataInicio: string): Promise<string> {
  const [{ n }] = await ex.execute<{ n: string }>(sql`select nextval('contrato_codigo_seq')::text as n`)
  return `CTR-${dataInicio.slice(0, 4)}-${n.padStart(6, '0')}`
}

// ---------------------------------------------------------------- escrita: criar

export interface OpcoesInsercao {
  /** 'Original' no cadastro; 'Renovação' quando o contrato nasce de uma renovação. */
  tipoVigencia: 'Original' | 'Renovação'
  /** Contrato que este renova. */
  renovaContratoId?: string
  /** Opções que podem seguir mesmo inativas (as que o antecessor já usava). */
  opcoesHerdadas?: Partial<Record<ChaveOpcao, string>>
  verificarDuplicidade: boolean
  descricaoAuditoria: string
  arquivo?: { arquivo: ArquivoValidado; tipo: 'Contrato' | 'Renovação' }
}

/**
 * Insere contrato + vigência inicial (+ documento) numa transação já aberta.
 * Usado pelo cadastro e pela renovação, que roda tudo numa transação só.
 */
export async function inserirContrato(
  tx: Executor,
  gravacao: Gravacao,
  usuario: UsuarioSessao,
  dados: DadosCriarContrato,
  contexto: ContextoAuditoria,
  opcoes: OpcoesInsercao,
): Promise<Linha> {
  const pessoas = {
    gestorEmail: dados.gestorEmail,
    responsavelJuridicoEmail: dados.responsavelJuridicoEmail,
    acessoRestrito: dados.acessoRestrito,
  }
  if (!continuariaVendo(usuario, pessoas)) throw mensagemTrancado(usuario)

  await validarOpcoes(tx, dados, opcoes.opcoesHerdadas)

  if (opcoes.verificarDuplicidade && !dados.confirmarDuplicidade) {
    // Mesmo fornecedor, vigencias que se cruzam, contrato aberto. So entre os
    // que o usuario ve: a mensagem lista os parecidos, e nao pode revelar restritos.
    const parecidos = await tx
      .select({ id: contratos.id, codigo: contratos.codigo, nome: contratos.nome, dataInicio: contratos.dataInicio, dataFim: contratos.dataFim })
      .from(contratos)
      .where(
        and(
          eq(contratos.fornecedorDocumento, dados.fornecedorDocumento),
          isNull(contratos.encerradoEm),
          lte(contratos.dataInicio, dados.dataFim),
          gte(contratos.dataFim, dados.dataInicio),
          sqlVisivel(usuario),
        ),
      )
      .limit(5)
    if (parecidos.length) {
      throw new ErroApi(
        'POSSIVEL_DUPLICIDADE',
        'Já existe contrato aberto com este fornecedor e vigência que se cruza. Confirme se é mesmo um novo contrato.',
        { detalhes: { contratos: parecidos } },
      )
    }
  }

  const codigo = await proximoCodigo(tx, dados.dataInicio)
  const quem = carimboDe(usuario)
  const [novo] = await tx
    .insert(contratos)
    .values({
      codigo,
      nome: dados.nome,
      categoriaId: dados.categoriaId,
      segmentoId: dados.segmentoId,
      empresaId: dados.empresaId,
      filialId: dados.filialId,
      areaResponsavelId: dados.areaResponsavelId,
      centroCustoId: dados.centroCustoId,
      fornecedorNome: dados.fornecedorNome,
      fornecedorDocumento: dados.fornecedorDocumento,
      fornecedorContato: dados.fornecedorContato,
      objeto: dados.objeto,
      observacoes: dados.observacoes,
      gestorNome: dados.gestorNome,
      gestorEmail: dados.gestorEmail,
      responsavelJuridicoNome: dados.responsavelJuridicoNome,
      responsavelJuridicoEmail: dados.responsavelJuridicoEmail,
      acessoRestrito: dados.acessoRestrito,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      renovacaoAutomatica: dados.renovacaoAutomatica,
      prazoAvisoCancelamentoDias: dados.prazoAvisoCancelamentoDias,
      valorMensal: dinheiroDb(dados.valorMensal),
      formaPagamento: dados.formaPagamento,
      indiceReajuste: dados.indiceReajuste,
      dataBaseReajuste: dados.dataBaseReajuste,
      multaRescisao: dados.multaRescisao === null ? null : dinheiroDb(dados.multaRescisao),
      renovaContratoId: opcoes.renovaContratoId ?? null,
      criadoPorMatricula: quem.matricula,
      criadoPorNome: quem.nome,
    })
    .returning()

  // Documento antes da vigencia: a vigencia de renovacao aponta para ele.
  let documentoId: string | null = null
  if (opcoes.arquivo) {
    documentoId = (await inserirDocumento(tx, gravacao, usuario, novo.id, opcoes.arquivo, contexto)).id
  }

  await tx.insert(contratoVigencias).values({
    contratoId: novo.id,
    tipo: opcoes.tipoVigencia,
    dataInicio: novo.dataInicio,
    dataFim: novo.dataFim,
    valorMensal: novo.valorMensal,
    documentoId,
    criadoPorMatricula: quem.matricula,
    criadoPorNome: quem.nome,
  })

  await registrarAuditoria(
    tx,
    { usuario: quem, categoria: 'contrato', acao: 'contrato.criado', descricao: opcoes.descricaoAuditoria, contratoId: novo.id, dados: { codigo } },
    contexto,
  )
  return novo
}

/**
 * Cadastra o contrato. Com `arquivo`, anexa o contrato assinado (documento
 * tipo Contrato, versao 1) na MESMA transacao: ou fica tudo, ou nada -- nunca
 * um contrato cujo arquivo "se perdeu" nem um arquivo sem contrato.
 */
export async function criarContrato(
  usuario: UsuarioSessao,
  dados: DadosCriarContrato,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
  arquivo?: ArquivoValidado,
): Promise<ContratoDetalhe> {
  return comGravacao((gravacao) =>
    db.transaction(async (tx) => {
      const novo = await inserirContrato(tx, gravacao, usuario, dados, contexto, {
        tipoVigencia: 'Original',
        verificarDuplicidade: true,
        descricaoAuditoria: 'Cadastrou o contrato',
        arquivo: arquivo ? { arquivo, tipo: 'Contrato' } : undefined,
      })
      return montarDetalhe(tx, usuario, novo, hoje)
    }),
  )
}

// ---------------------------------------------------------------- escrita: editar

const ROTULOS: Record<string, string> = {
  nome: 'nome',
  categoriaId: 'categoria',
  segmentoId: 'segmento',
  empresaId: 'empresa',
  filialId: 'filial',
  areaResponsavelId: 'área responsável',
  centroCustoId: 'centro de custo',
  fornecedorNome: 'razão social',
  fornecedorDocumento: 'CNPJ/CPF',
  fornecedorContato: 'contato do fornecedor',
  objeto: 'objeto',
  observacoes: 'observações',
  gestorNome: 'gestor',
  gestorEmail: 'e-mail do gestor',
  responsavelJuridicoNome: 'responsável jurídico',
  responsavelJuridicoEmail: 'e-mail do responsável jurídico',
  acessoRestrito: 'acesso restrito',
  renovacaoAutomatica: 'renovação automática',
  prazoAvisoCancelamentoDias: 'prazo de aviso',
  formaPagamento: 'forma de pagamento',
  indiceReajuste: 'índice de reajuste',
  dataBaseReajuste: 'data-base de reajuste',
  multaRescisao: 'multa de rescisão',
  acaoVencimento: 'ação de vencimento',
  responsavelAcao: 'responsável pela ação',
  prazoAcao: 'prazo da ação',
  statusAcao: 'status da ação',
}

/** Textos longos: a descricao so diz que mudou; o antes/depois fica em `dados`. */
const SEM_VALOR_NA_DESCRICAO = new Set(['objeto', 'observacoes'])

/** Valor no formato do banco, para comparar com o que veio. */
function valorAtual(c: Linha, campo: string): unknown {
  const v = (c as Record<string, unknown>)[campo]
  if (campo === 'multaRescisao') return numeroOuNulo(v as string | null)
  return v ?? null
}

function legivel(campo: string, v: unknown, nomesOpcoes: Map<string, string>): string {
  if (v === null || v === undefined || v === '') return '—'
  if (campo in CAMPO_DA_OPCAO) return nomesOpcoes.get(v as string) ?? String(v)
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (campo === 'multaRescisao') return formatarMoeda(v as number)
  if (campo === 'fornecedorDocumento') return formatarDocumento(v as string)
  if (campo === 'prazoAvisoCancelamentoDias') return `${v} dias`
  if (campo === 'dataBaseReajuste' || campo === 'prazoAcao') return formatarData(v as string)
  return String(v)
}

/** Erro 400 se o corpo tenta mudar o que so muda por aditivo/rota propria. */
export function recusarCamposForaDaEdicao(corpo: unknown) {
  if (!corpo || typeof corpo !== 'object') return
  const campos: Record<string, string> = {}
  for (const c of CAMPOS_FORA_DA_EDICAO) {
    if (c in corpo) {
      campos[c] =
        c === 'dataInicio' || c === 'dataFim' || c === 'valorMensal'
          ? 'Vigência e valor mudam por aditivo, não por edição.'
          : 'Este campo não pode ser alterado aqui.'
    }
  }
  if (Object.keys(campos).length) throw erroValidacao(campos, 'Há campos que não podem ser editados.')
}

export async function editarContrato(
  usuario: UsuarioSessao,
  id: string,
  dados: DadosEditarContrato,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<ContratoDetalhe> {
  return db.transaction(async (tx) => {
    const atual = await carregar(tx, usuario, id, true)
    if (atual.encerradoEm) throw erroRegraNegocio('Contrato encerrado não pode ser editado.')
    if (atual.versao !== dados.versao) {
      throw erroConflito('Este contrato foi alterado por outra pessoa. Recarregue a página e refaça a alteração.')
    }

    const { versao: _versao, ...pedido } = dados
    const mudancas: Record<string, unknown> = {}
    for (const [campo, novo] of Object.entries(pedido)) {
      if (novo === undefined) continue
      if (valorAtual(atual, campo) !== novo) mudancas[campo] = novo
    }

    // Acao de vencimento: estado resultante coerente.
    const acao = 'acaoVencimento' in mudancas ? (mudancas.acaoVencimento as string | null) : atual.acaoVencimento
    if (acao === null) {
      for (const c of ['responsavelAcao', 'prazoAcao', 'statusAcao'] as const) {
        if (atual[c] !== null) mudancas[c] = null
        else delete mudancas[c]
      }
    } else {
      const responsavel = 'responsavelAcao' in mudancas ? mudancas.responsavelAcao : atual.responsavelAcao
      const prazo = 'prazoAcao' in mudancas ? mudancas.prazoAcao : atual.prazoAcao
      const campos: Record<string, string> = {}
      if (!responsavel) campos.responsavelAcao = 'Informe o responsável pela ação.'
      if (!prazo) campos.prazoAcao = 'Informe o prazo da ação.'
      if (Object.keys(campos).length) throw erroValidacao(campos)
      const status = 'statusAcao' in mudancas ? mudancas.statusAcao : atual.statusAcao
      if (!status) mudancas.statusAcao = 'Pendente'
    }

    if (!Object.keys(mudancas).length) return montarDetalhe(tx, usuario, atual, hoje)

    // Restricao: so admin ou envolvido mudam; e ninguem (fora admin) se tranca fora.
    if ('acessoRestrito' in mudancas && !ehAdmin(usuario) && !ehEnvolvido(usuario, atual)) {
      throw erroSemPermissao('Só administradores, o gestor e o responsável jurídico alteram o acesso restrito.')
    }
    const resultado = {
      gestorEmail: (mudancas.gestorEmail as string | undefined) ?? atual.gestorEmail,
      responsavelJuridicoEmail: (mudancas.responsavelJuridicoEmail as string | undefined) ?? atual.responsavelJuridicoEmail,
      acessoRestrito: (mudancas.acessoRestrito as boolean | undefined) ?? atual.acessoRestrito,
    }
    if (!continuariaVendo(usuario, resultado)) throw mensagemTrancado(usuario)

    const escolhidas = Object.fromEntries(Object.entries(mudancas).filter(([k]) => k in CAMPO_DA_OPCAO)) as Partial<Record<ChaveOpcao, string>>
    await validarOpcoes(tx, escolhidas, atual)
    // Nomes das opcoes antigas e novas, para a descricao legivel.
    const idsOpcoes = Object.keys(escolhidas).flatMap((k) => [escolhidas[k as ChaveOpcao]!, atual[k as ChaveOpcao]])
    const nomesOpcoes = idsOpcoes.length
      ? new Map((await tx.select().from(opcoesCadastro).where(inArray(opcoesCadastro.id, idsOpcoes))).map((o) => [o.id, o.valor]))
      : new Map<string, string>()

    const valoresDb = { ...mudancas } as Record<string, unknown>
    if ('multaRescisao' in valoresDb) valoresDb.multaRescisao = valoresDb.multaRescisao === null ? null : dinheiroDb(valoresDb.multaRescisao as number)

    const [editado] = await tx
      .update(contratos)
      .set({ ...(valoresDb as Partial<Linha>), versao: atual.versao + 1, atualizadoEm: new Date().toISOString() })
      .where(eq(contratos.id, id))
      .returning()

    const diff = Object.fromEntries(Object.entries(mudancas).map(([k, v]) => [k, { de: valorAtual(atual, k), para: v }]))
    const partes = Object.keys(mudancas).map((k) =>
      SEM_VALOR_NA_DESCRICAO.has(k)
        ? ROTULOS[k]
        : `${ROTULOS[k]}: ${legivel(k, valorAtual(atual, k), nomesOpcoes)} → ${legivel(k, mudancas[k], nomesOpcoes)}`,
    )
    let descricao = `Alterou ${partes.join('; ')}`
    if (descricao.length > 1000) descricao = `${descricao.slice(0, 997)}…`

    await registrarAuditoria(
      tx,
      { usuario: carimboDe(usuario), categoria: 'contrato', acao: 'contrato.editado', descricao, contratoId: id, dados: diff },
      contexto,
    )
    return montarDetalhe(tx, usuario, editado, hoje)
  })
}

// ---------------------------------------------------------------- encerrar / reabrir

export async function encerrarContrato(
  usuario: UsuarioSessao,
  id: string,
  dados: DadosEncerrar,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<ContratoDetalhe> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const atual = await carregar(tx, usuario, id, true)
    if (atual.encerradoEm) throw erroRegraNegocio('Este contrato já está encerrado.')
    if (atual.versao !== dados.versao) {
      throw erroConflito('Este contrato foi alterado por outra pessoa. Recarregue a página antes de encerrar.')
    }
    const data = dados.data ?? hoje
    if (data > hoje) throw erroValidacao({ data: 'O encerramento registra algo que já aconteceu: a data não pode ser futura.' })
    if (data < atual.dataInicio) throw erroValidacao({ data: `A data não pode ser anterior ao início do contrato (${formatarData(atual.dataInicio)}).` })

    const quem = carimboDe(usuario)
    const [encerrado] = await tx
      .update(contratos)
      .set({
        encerradoEm: data,
        motivoEncerramento: 'manual',
        justificativaEncerramento: dados.justificativa,
        encerradoPorMatricula: quem.matricula,
        encerradoPorNome: quem.nome,
        ...(atual.acaoVencimento ? { statusAcao: 'Concluída' as const } : {}),
        versao: atual.versao + 1,
        atualizadoEm: new Date().toISOString(),
      })
      .where(eq(contratos.id, id))
      .returning()

    await aoEncerrar(tx, id, data, usuario, contexto)
    await registrarAuditoria(
      tx,
      {
        usuario: quem,
        categoria: 'contrato',
        acao: 'contrato.encerrado',
        descricao: `Encerrou o contrato em ${formatarData(data)} — ${dados.justificativa}`,
        contratoId: id,
        dados: { data, justificativa: dados.justificativa },
      },
      contexto,
    )
    return montarDetalhe(tx, usuario, encerrado, hoje)
  })
}

/** Desfaz um encerramento manual (decisão: admin, a qualquer tempo, com justificativa). */
export async function reabrirContrato(
  usuario: UsuarioSessao,
  id: string,
  dados: DadosReabrir,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<ContratoDetalhe> {
  exigirAdmin(usuario)
  return db.transaction(async (tx) => {
    const atual = await carregar(tx, usuario, id, true)
    if (!atual.encerradoEm) throw erroRegraNegocio('Este contrato não está encerrado.')
    if (atual.motivoEncerramento === 'renovado') {
      throw erroRegraNegocio('Contrato encerrado por renovação não pode ser reaberto: a vigência continua no contrato que o renovou.')
    }
    if (atual.versao !== dados.versao) {
      throw erroConflito('Este contrato foi alterado por outra pessoa. Recarregue a página antes de reabrir.')
    }

    const [reaberto] = await tx
      .update(contratos)
      .set({
        encerradoEm: null,
        motivoEncerramento: null,
        justificativaEncerramento: null,
        encerradoPorMatricula: null,
        encerradoPorNome: null,
        versao: atual.versao + 1,
        atualizadoEm: new Date().toISOString(),
      })
      .where(eq(contratos.id, id))
      .returning()
    await aoReabrir(tx, id, usuario, contexto)

    await registrarAuditoria(
      tx,
      {
        usuario: carimboDe(usuario),
        categoria: 'contrato',
        acao: 'contrato.reaberto',
        descricao: `Reabriu o contrato (encerrado em ${formatarData(atual.encerradoEm)}) — ${dados.justificativa}`,
        contratoId: id,
        dados: {
          encerramentoDesfeito: { data: atual.encerradoEm, justificativa: atual.justificativaEncerramento, por: atual.encerradoPorNome },
          justificativa: dados.justificativa,
        },
      },
      contexto,
    )
    return montarDetalhe(tx, usuario, reaberto, hoje)
  })
}

// ---------------------------------------------------------------- auditoria do contrato

export function paraEvento(l: typeof auditoria.$inferSelect, contrato: EventoAuditoria['contrato']): EventoAuditoria {
  return {
    id: l.id,
    ocorridoEm: isoInstante(l.ocorridoEm),
    usuario: carimbo(l.usuarioMatricula, l.usuarioNome),
    contrato,
    categoria: l.categoria,
    acao: l.acao,
    descricao: l.descricao,
    dados: l.dados,
  }
}

export async function auditoriaDoContrato(
  usuario: UsuarioSessao,
  id: string,
  opcoes: { pagina: number; porPagina: number; incluirAcessos: boolean },
): Promise<Paginado<EventoAuditoria>> {
  const c = await carregar(db, usuario, id)
  const onde = and(
    eq(auditoria.contratoId, id),
    opcoes.incluirAcessos && ehAdmin(usuario) ? undefined : ne(auditoria.categoria, 'acesso'),
  )
  const [linhas, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditoria)
      .where(onde)
      .orderBy(desc(auditoria.ocorridoEm), desc(auditoria.id))
      .limit(opcoes.porPagina)
      .offset((opcoes.pagina - 1) * opcoes.porPagina),
    db.select({ total: sql<number>`count(*)::int` }).from(auditoria).where(onde),
  ])
  const ref = { id: c.id, codigo: c.codigo, nome: c.nome }
  return { itens: linhas.map((l) => paraEvento(l, ref)), total, pagina: opcoes.pagina, porPagina: opcoes.porPagina }
}

export { sqlDecisaoUrgente, sqlDiasVencimento, sqlStatus }
