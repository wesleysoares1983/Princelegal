/**
 * Erros de dominio que viram resposta HTTP (envelope em docs/BACKEND_IMPLEMENTATION.md §4.3).
 *
 * Servicos lancam estes erros; o `rota()` traduz para status + JSON. Assim a
 * regra de negocio nao conhece HTTP, e toda rota responde no mesmo formato.
 */

export type CodigoErro =
  | 'VALIDACAO'
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'NAO_ENCONTRADO'
  | 'CONFLITO'
  | 'POSSIVEL_DUPLICIDADE'
  | 'ARQUIVO_GRANDE'
  | 'TIPO_NAO_SUPORTADO'
  | 'REGRA_NEGOCIO'
  | 'ERRO_INTERNO'

const STATUS: Record<CodigoErro, number> = {
  VALIDACAO: 400,
  NAO_AUTENTICADO: 401,
  SEM_PERMISSAO: 403,
  NAO_ENCONTRADO: 404,
  CONFLITO: 409,
  POSSIVEL_DUPLICIDADE: 409,
  ARQUIVO_GRANDE: 413,
  TIPO_NAO_SUPORTADO: 415,
  REGRA_NEGOCIO: 422,
  ERRO_INTERNO: 500,
}

export interface CorpoErro {
  erro: {
    codigo: CodigoErro
    mensagem: string
    /** Campo -> mensagem, so em VALIDACAO. */
    campos?: Record<string, string>
    /** Dados extras para a tela (ex.: contratos parecidos em POSSIVEL_DUPLICIDADE). */
    detalhes?: unknown
    /** So em ERRO_INTERNO: para achar o erro no log. */
    idRastreio?: string
  }
}

export class ErroApi extends Error {
  readonly status: number

  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
    readonly extras: Omit<CorpoErro['erro'], 'codigo' | 'mensagem'> = {},
  ) {
    super(mensagem)
    this.name = 'ErroApi'
    this.status = STATUS[codigo]
  }

  corpo(): CorpoErro {
    return { erro: { codigo: this.codigo, mensagem: this.message, ...this.extras } }
  }
}

export const erroValidacao = (campos: Record<string, string>, mensagem = 'Verifique os campos destacados.') =>
  new ErroApi('VALIDACAO', mensagem, { campos })
export const erroNaoAutenticado = () => new ErroApi('NAO_AUTENTICADO', 'Sessão expirada. Entre novamente.')
export const erroSemPermissao = (mensagem = 'Você não tem permissão para esta ação.') => new ErroApi('SEM_PERMISSAO', mensagem)
/** Tambem para contrato restrito que o usuario nao pode ver: nunca revelar que ele existe. */
export const erroNaoEncontrado = (mensagem = 'Registro não encontrado.') => new ErroApi('NAO_ENCONTRADO', mensagem)
export const erroConflito = (mensagem: string, detalhes?: unknown) => new ErroApi('CONFLITO', mensagem, { detalhes })
export const erroRegraNegocio = (mensagem: string, detalhes?: unknown) => new ErroApi('REGRA_NEGOCIO', mensagem, { detalhes })
