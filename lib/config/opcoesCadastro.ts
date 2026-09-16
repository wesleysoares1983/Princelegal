'use client'

/**
 * Opções de cadastro do formulário de Novo Contrato (Categoria, Empresa,
 * Filial, Centro de Custo, Área Responsável).
 *
 * Sem backend nesta versão: cada lista fica salva no localStorage do
 * navegador, semeada com os valores que hoje estão fixos no código. Um
 * `CustomEvent('cj:config')` avisa as telas abertas (a tela de Configurações
 * e o formulário de Novo Contrato) para recarregar quando alguém adiciona ou
 * remove uma opção.
 */

export interface CampoCadastro {
  id: string
  titulo: string
}

export const CAMPOS_CADASTRO: CampoCadastro[] = [
  { id: 'categoria', titulo: 'Categoria' },
  { id: 'empresa', titulo: 'Empresa' },
  { id: 'filial', titulo: 'Filial' },
  { id: 'centro-custo', titulo: 'Centro de Custo' },
  { id: 'area-responsavel', titulo: 'Área Responsável' },
]

/** Semente: os valores que hoje estão fixos no código, para a lista não nascer vazia. */
const PADRAO: Record<string, string[]> = {
  categoria: [
    'Aluguel',
    'Água',
    'Energia',
    'Condomínio',
    'Telecom',
    'Licença',
    'Seguro',
    'Prestação de Serviço',
    'Jurídico',
    'Outros',
  ],
  empresa: ['Princesa dos Campos'],
  filial: ['Matriz', 'Curitiba'],
  'centro-custo': ['CC-1002', 'CC-2001', 'CC-3005'],
  'area-responsavel': ['Administrativo', 'TI', 'Operações', 'RH', 'Financeiro', 'Jurídico'],
}

const chave = (campo: string) => `cj:opcoes:${campo}`

export function lerOpcoes(campo: string): string[] {
  try {
    const s = localStorage.getItem(chave(campo))
    if (s) return JSON.parse(s) as string[]
  } catch {
    /* armazenamento bloqueado -- cai no padrao */
  }
  return PADRAO[campo] ?? []
}

function gravar(campo: string, lista: string[]) {
  try {
    localStorage.setItem(chave(campo), JSON.stringify(lista))
    window.dispatchEvent(new CustomEvent('cj:config'))
  } catch {
    /* idem */
  }
}

export function adicionarOpcao(campo: string, valor: string) {
  const v = valor.trim()
  if (!v) return
  const lista = lerOpcoes(campo)
  if (lista.includes(v)) return
  gravar(campo, [...lista, v])
}

export function removerOpcao(campo: string, valor: string) {
  gravar(
    campo,
    lerOpcoes(campo).filter((v) => v !== valor),
  )
}
