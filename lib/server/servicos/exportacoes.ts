import 'server-only'
import type { z } from 'zod'
import { esquemaListarContratos } from '@/lib/shared/contratos'
import { hojeSP } from '@/lib/shared/datas'
import { formatarDocumento } from '@/lib/shared/documentoFiscal'
import { esquemaListarObrigacoes, type Obrigacao } from '@/lib/shared/obrigacoes'
import { dataLimiteAviso, proximoReajuste, STATUS_INFO } from '@/lib/shared/status'
import type { UsuarioSessao } from '@/lib/usuario'
import { registrarAuditoria, type ContextoAuditoria } from '../auditoria'
import { db } from '../db/cliente'
import { esquemaFormato, exigirDentroDoLimite, LIMITE_EXPORTACAO, respostaExportacao, type Coluna } from '../exportacao'
import { avaliacaoDe, linhasParaExportar, type LinhaExportacaoContrato } from './contratos'
import { obrigacoesParaExportar } from './obrigacoes'

/**
 * Exportações (docs/BACKEND_IMPLEMENTATION.md §8.12): o botão exporta o que
 * a pessoa está vendo -- mesmos filtros, visibilidade e ordem da lista, sem
 * paginação. Cada exportação vai para a auditoria com filtros e quantidade.
 */

export const esquemaExportarContratos = esquemaListarContratos.omit({ pagina: true, porPagina: true }).extend({ formato: esquemaFormato })
export const esquemaExportarObrigacoes = esquemaListarObrigacoes.omit({ pagina: true, porPagina: true }).extend({ formato: esquemaFormato })

/** Filtros que a pessoa escolheu (sem os padrões vazios), para a auditoria. */
function filtrosUsados(f: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'formato' && v !== undefined && v !== false))
}

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

// ---------------------------------------------------------------- contratos

function colunasContratos(hoje: string): Coluna<LinhaExportacaoContrato>[] {
  const valorMensal = (r: LinhaExportacaoContrato) => Number(r.c.valorMensal)
  return [
    { titulo: 'Código', tipo: 'texto', largura: 18, valor: (r) => r.c.codigo },
    { titulo: 'Nome', tipo: 'texto', largura: 40, valor: (r) => r.c.nome },
    { titulo: 'Status', tipo: 'texto', largura: 20, valor: (r) => STATUS_INFO[avaliacaoDe(r.c, hoje, r.sucessorCodigo).status].rotulo },
    { titulo: 'Categoria', tipo: 'texto', largura: 20, valor: (r) => r.categoria },
    { titulo: 'Segmento', tipo: 'texto', largura: 20, valor: (r) => r.segmento },
    { titulo: 'Empresa', tipo: 'texto', largura: 24, valor: (r) => r.empresa },
    { titulo: 'Filial', tipo: 'texto', largura: 20, valor: (r) => r.filial },
    { titulo: 'Área', tipo: 'texto', largura: 20, valor: (r) => r.area },
    { titulo: 'Centro de custo', tipo: 'texto', largura: 20, valor: (r) => r.centroCusto },
    { titulo: 'Fornecedor', tipo: 'texto', largura: 36, valor: (r) => r.c.fornecedorNome },
    { titulo: 'CNPJ/CPF', tipo: 'texto', largura: 20, valor: (r) => formatarDocumento(r.c.fornecedorDocumento) },
    { titulo: 'Gestor', tipo: 'texto', largura: 24, valor: (r) => r.c.gestorNome },
    { titulo: 'Responsável jurídico', tipo: 'texto', largura: 24, valor: (r) => r.c.responsavelJuridicoNome },
    { titulo: 'Início', tipo: 'data', valor: (r) => r.c.dataInicio },
    { titulo: 'Término', tipo: 'data', valor: (r) => r.c.dataFim },
    { titulo: 'Prazo de aviso (dias)', tipo: 'inteiro', valor: (r) => r.c.prazoAvisoCancelamentoDias },
    { titulo: 'Data-limite de aviso', tipo: 'data', valor: (r) => dataLimiteAviso(r.c.dataFim, r.c.prazoAvisoCancelamentoDias) },
    { titulo: 'Renovação automática', tipo: 'simnao', valor: (r) => r.c.renovacaoAutomatica },
    { titulo: 'Valor mensal', tipo: 'moeda', largura: 16, valor: valorMensal },
    { titulo: 'Valor anual', tipo: 'moeda', largura: 16, valor: (r) => Math.round(valorMensal(r) * 12 * 100) / 100 },
    { titulo: 'Forma de pagamento', tipo: 'texto', largura: 20, valor: (r) => r.c.formaPagamento },
    { titulo: 'Índice', tipo: 'texto', valor: (r) => r.c.indiceReajuste },
    { titulo: 'Próximo reajuste', tipo: 'data', valor: (r) => proximoReajuste(r.c.dataBaseReajuste, hoje) },
    { titulo: 'Multa de rescisão', tipo: 'moeda', largura: 16, valor: (r) => (r.c.multaRescisao === null ? null : Number(r.c.multaRescisao)) },
    { titulo: 'Ação de vencimento', tipo: 'texto', largura: 18, valor: (r) => r.c.acaoVencimento },
    { titulo: 'Restrito', tipo: 'simnao', valor: (r) => r.c.acessoRestrito },
  ]
}

export async function exportarContratos(
  usuario: UsuarioSessao,
  f: z.infer<typeof esquemaExportarContratos>,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<Response> {
  const linhas = await linhasParaExportar(usuario, f, LIMITE_EXPORTACAO, hoje)
  exigirDentroDoLimite(linhas.length)

  const resposta = await respostaExportacao({ formato: f.formato, base: 'contratos', aba: 'Contratos', hoje, colunas: colunasContratos(hoje), linhas })
  await registrarAuditoria(
    db,
    {
      usuario,
      categoria: 'exportacao',
      acao: 'exportacao.contratos',
      descricao: `Exportou ${plural(linhas.length, 'contrato', 'contratos')} (${f.formato.toUpperCase()})`,
      dados: { formato: f.formato, linhas: linhas.length, filtros: filtrosUsados(f) },
    },
    contexto,
  )
  return resposta
}

// ---------------------------------------------------------------- obrigações

const SITUACAO: Record<Obrigacao['situacao'], string> = { pendente: 'Pendente', cumprida: 'Cumprida', cancelada: 'Cancelada' }

const COLUNAS_OBRIGACOES: Coluna<Obrigacao>[] = [
  { titulo: 'Código do contrato', tipo: 'texto', largura: 18, valor: (o) => o.contrato.codigo },
  { titulo: 'Contrato', tipo: 'texto', largura: 36, valor: (o) => o.contrato.nome },
  { titulo: 'Descrição', tipo: 'texto', largura: 48, valor: (o) => o.descricao },
  { titulo: 'Responsável', tipo: 'texto', largura: 24, valor: (o) => o.responsavel },
  { titulo: 'Data', tipo: 'data', valor: (o) => o.data },
  { titulo: 'Recorrência', tipo: 'texto', valor: (o) => o.recorrencia },
  { titulo: 'Situação', tipo: 'texto', valor: (o) => SITUACAO[o.situacao] },
  { titulo: 'Cumprida em', tipo: 'data', valor: (o) => o.cumpridaEm },
  { titulo: 'Cumprida por', tipo: 'texto', largura: 24, valor: (o) => o.cumpridaPor?.nome ?? null },
  { titulo: 'Atrasada', tipo: 'simnao', valor: (o) => o.atrasada },
]

export async function exportarObrigacoes(
  usuario: UsuarioSessao,
  f: z.infer<typeof esquemaExportarObrigacoes>,
  contexto: ContextoAuditoria,
  hoje: string = hojeSP(),
): Promise<Response> {
  const linhas = await obrigacoesParaExportar(usuario, f, LIMITE_EXPORTACAO, hoje)
  exigirDentroDoLimite(linhas.length)

  const resposta = await respostaExportacao({ formato: f.formato, base: 'obrigacoes', aba: 'Obrigações', hoje, colunas: COLUNAS_OBRIGACOES, linhas })
  await registrarAuditoria(
    db,
    {
      usuario,
      categoria: 'exportacao',
      acao: 'exportacao.obrigacoes',
      descricao: `Exportou ${plural(linhas.length, 'obrigação', 'obrigações')} (${f.formato.toUpperCase()})`,
      dados: { formato: f.formato, linhas: linhas.length, filtros: filtrosUsados(f) },
    },
    contexto,
  )
  return resposta
}
