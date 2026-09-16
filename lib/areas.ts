/**
 * Areas do menu lateral, mesma ideia do Princevision: uma lista so, o menu e
 * as rotas saem dela.
 */
export interface Subitem {
  href: string
  nome: string
  /** So os itens de nivel raiz do rodape (Configuracoes, Ajuda) usam icone proprio. */
  icone?: string
  itens?: Subitem[]
}

export interface Area {
  slug: string
  nome: string
  icone: string
  subitens?: Subitem[]
}

export const AREAS: Area[] = [
  {
    slug: 'contratos',
    nome: 'Contratos',
    icone: 'livro',
  },
  {
    slug: 'obrigacoes',
    nome: 'Obrigações',
    icone: 'lista',
  },
  {
    slug: 'alertas',
    nome: 'Alertas',
    icone: 'sino',
  },
  {
    slug: 'auditoria',
    nome: 'Auditoria',
    icone: 'relogio',
  },
]

export const acharArea = (slug: string) => AREAS.find((a) => a.slug === slug)
