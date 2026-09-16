import type { Contrato } from './tipos'

/**
 * Dados de exemplo, em memória.
 *
 * Sem backend nesta primeira versão: a tela existe para validar o modelo
 * (os blocos do bloco Identificação -> Auditoria) antes de plugar numa base
 * real ou no Protheus. Trocar por uma API depois não muda `Contrato` nem as
 * telas, só de onde `listarContratos` busca os dados.
 */

function id(prefixo: string, n: number) {
  return `${prefixo}-${String(n).padStart(4, '0')}`
}

export const CONTRATOS: Contrato[] = [
  {
    id: 'c1',
    codigo: 'CTR-2026-000123',
    nome: 'Locação – Unidade Curitiba',
    categoria: 'Aluguel',
    fornecedorNome: 'Imobiliária Santos & Cia',
    fornecedorDocumento: '12.345.678/0001-90',
    fornecedorContato: 'contato@imobsantos.com.br',
    objeto: 'Locação do galpão da unidade de Curitiba para operação logística.',
    empresa: 'Princesa dos Campos',
    filial: 'Curitiba',
    areaResponsavel: 'Administrativo',
    gestor: 'João Silva',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2023-10-01',
    dataFim: '2026-09-30',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 90,
    valorMensal: 25000,
    formaPagamento: 'Boleto',
    centroCusto: 'CC-1002',
    indiceReajuste: 'IGP-M',
    dataBaseReajuste: '2023-10-01',
    acaoVencimento: 'Renegociar',
    responsavelAcao: 'Wesley Soares',
    prazoAcao: '2026-09-30',
    statusAcao: 'Em andamento',
    obrigacoes: [
      { id: id('OB', 1), descricao: 'Pagamento até o dia 10', responsavel: 'Financeiro', data: '2026-10-10', recorrencia: 'Mensal', cumprida: false },
      { id: id('OB', 2), descricao: 'Seguro contra incêndio vigente', responsavel: 'Administrativo', data: '2027-01-15', recorrencia: 'Anual', cumprida: true },
      { id: id('OB', 3), descricao: 'Aviso prévio de rescisão com 90 dias', responsavel: 'Jurídico', data: '2026-07-02', recorrencia: 'Por evento', cumprida: false },
    ],
    documentos: [
      { id: id('DOC', 1), nome: 'Contrato de locação.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2023-10-01', enviadoPor: 'Ana Ribeiro' },
      { id: id('DOC', 2), nome: 'Aditivo 01 - reajuste 2024.pdf', tipo: 'Aditivo', versao: 1, enviadoEm: '2024-10-05', enviadoPor: 'Ana Ribeiro' },
    ],
    historico: [
      { id: id('H', 1), tipo: 'Original', dataInicio: '2023-10-01', dataFim: '2026-09-30', valorMensal: 22000 },
      { id: id('H', 2), tipo: 'Aditivo', dataInicio: '2024-10-01', dataFim: '2026-09-30', valorMensal: 25000, observacao: 'Reajuste IGP-M 2024' },
    ],
    auditoria: [
      { id: id('A', 1), data: '2023-10-01', usuario: 'Ana Ribeiro', acao: 'Cadastrou o contrato' },
      { id: id('A', 2), data: '2024-10-05', usuario: 'Ana Ribeiro', acao: 'Anexou Aditivo 01' },
      { id: id('A', 3), data: '2026-08-01', usuario: 'Sistema', acao: 'Disparou alerta de 60 dias' },
    ],
  },
  {
    id: 'c2',
    codigo: 'CTR-2026-000124',
    nome: 'Energia Elétrica – Unidade Operações',
    categoria: 'Energia',
    fornecedorNome: 'Copel Distribuição S.A.',
    fornecedorDocumento: '04.368.898/0001-06',
    objeto: 'Fornecimento de energia elétrica para o centro de distribuição.',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'Operações',
    gestor: 'Maria Fernandes',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2024-11-01',
    dataFim: '2026-10-12',
    renovacaoAutomatica: true,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 41500,
    formaPagamento: 'Débito automático',
    centroCusto: 'CC-2001',
    indiceReajuste: 'Fixo',
    dataBaseReajuste: '2024-11-01',
    obrigacoes: [
      { id: id('OB', 4), descricao: 'Leitura e conferência mensal de consumo', responsavel: 'Operações', data: '2026-10-05', recorrencia: 'Mensal', cumprida: false },
    ],
    documentos: [
      { id: id('DOC', 3), nome: 'Contrato de fornecimento.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2024-11-01', enviadoPor: 'Maria Fernandes' },
    ],
    historico: [
      { id: id('H', 3), tipo: 'Original', dataInicio: '2024-11-01', dataFim: '2026-10-12', valorMensal: 41500 },
    ],
    auditoria: [
      { id: id('A', 4), data: '2024-11-01', usuario: 'Maria Fernandes', acao: 'Cadastrou o contrato' },
    ],
  },
  {
    id: 'c3',
    codigo: 'CTR-2026-000125',
    nome: 'Telecom – Links de Dados',
    categoria: 'Telecom',
    fornecedorNome: 'Vivo Empresas',
    fornecedorDocumento: '02.558.157/0001-62',
    objeto: 'Links de dados dedicados entre matriz e filiais.',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'TI',
    gestor: 'Pedro Alves',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2025-11-01',
    dataFim: '2026-11-01',
    renovacaoAutomatica: true,
    prazoAvisoCancelamentoDias: 60,
    valorMensal: 8700,
    formaPagamento: 'Boleto',
    centroCusto: 'CC-3005',
    indiceReajuste: 'IPCA',
    dataBaseReajuste: '2025-11-01',
    obrigacoes: [
      { id: id('OB', 5), descricao: 'SLA de disponibilidade 99,5%', responsavel: 'TI', data: '2026-12-01', recorrencia: 'Mensal', cumprida: true },
    ],
    documentos: [
      { id: id('DOC', 4), nome: 'Contrato de prestação de serviço.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2025-11-01', enviadoPor: 'Pedro Alves' },
    ],
    historico: [
      { id: id('H', 4), tipo: 'Original', dataInicio: '2025-11-01', dataFim: '2026-11-01', valorMensal: 8700 },
    ],
    auditoria: [
      { id: id('A', 5), data: '2025-11-01', usuario: 'Pedro Alves', acao: 'Cadastrou o contrato' },
    ],
  },
  {
    id: 'c4',
    codigo: 'CTR-2026-000098',
    nome: 'Condomínio – Sede Administrativa',
    categoria: 'Condomínio',
    fornecedorNome: 'Condomínio Ed. Torres Corporate',
    fornecedorDocumento: '19.876.543/0001-11',
    objeto: 'Taxa condominial da sede administrativa.',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'Administrativo',
    gestor: 'João Silva',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2022-01-01',
    dataFim: '2026-08-31',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 6200,
    formaPagamento: 'Boleto',
    centroCusto: 'CC-1002',
    indiceReajuste: 'Outro',
    dataBaseReajuste: '2022-01-01',
    acaoVencimento: 'Em análise',
    responsavelAcao: 'João Silva',
    prazoAcao: '2026-09-20',
    statusAcao: 'Pendente',
    obrigacoes: [
      { id: id('OB', 6), descricao: 'Pagamento até o dia 5', responsavel: 'Financeiro', data: '2026-09-05', recorrencia: 'Mensal', cumprida: false },
    ],
    documentos: [
      { id: id('DOC', 5), nome: 'Convenção condominial.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2022-01-01', enviadoPor: 'João Silva' },
    ],
    historico: [
      { id: id('H', 5), tipo: 'Original', dataInicio: '2022-01-01', dataFim: '2026-08-31', valorMensal: 6200 },
    ],
    auditoria: [
      { id: id('A', 6), data: '2022-01-01', usuario: 'João Silva', acao: 'Cadastrou o contrato' },
      { id: id('A', 7), data: '2026-09-01', usuario: 'Sistema', acao: 'Disparou alerta: contrato fora da vigência' },
    ],
  },
  {
    id: 'c5',
    codigo: 'CTR-2025-000071',
    nome: 'Licença – Suíte de Escritório',
    categoria: 'Licença',
    fornecedorNome: 'Microsoft Brasil',
    fornecedorDocumento: '01.166.321/0001-99',
    objeto: 'Licenciamento Microsoft 365 corporativo.',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'TI',
    gestor: 'Pedro Alves',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2024-06-01',
    dataFim: '2025-06-01',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 12400,
    formaPagamento: 'Cartão corporativo',
    centroCusto: 'CC-3005',
    indiceReajuste: 'Fixo',
    dataBaseReajuste: '2024-06-01',
    obrigacoes: [],
    documentos: [
      { id: id('DOC', 6), nome: 'Contrato de licenciamento.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2024-06-01', enviadoPor: 'Pedro Alves' },
      { id: id('DOC', 7), nome: 'Renovação 2025.pdf', tipo: 'Renovação', versao: 1, enviadoEm: '2025-05-20', enviadoPor: 'Pedro Alves' },
    ],
    historico: [
      { id: id('H', 6), tipo: 'Original', dataInicio: '2024-06-01', dataFim: '2025-06-01', valorMensal: 11800 },
      { id: id('H', 7), tipo: 'Renovação', dataInicio: '2025-06-01', dataFim: '2026-06-01', valorMensal: 12400, observacao: 'Renovado por 12 meses' },
    ],
    auditoria: [
      { id: id('A', 8), data: '2024-06-01', usuario: 'Pedro Alves', acao: 'Cadastrou o contrato' },
      { id: id('A', 9), data: '2025-05-20', usuario: 'Pedro Alves', acao: 'Registrou renovação' },
    ],
  },
  {
    id: 'c6',
    codigo: 'CTR-2024-000045',
    nome: 'Seguro – Frota de Veículos',
    categoria: 'Seguro',
    fornecedorNome: 'Porto Seguro',
    fornecedorDocumento: '61.198.164/0001-60',
    objeto: 'Apólice de seguro para a frota de veículos leves.',
    empresa: 'Princesa dos Campos',
    filial: 'Matriz',
    areaResponsavel: 'Operações',
    gestor: 'Maria Fernandes',
    responsavelJuridico: 'Ana Ribeiro',
    acessoRestrito: false,
    dataInicio: '2023-03-01',
    dataFim: '2024-03-01',
    renovacaoAutomatica: false,
    prazoAvisoCancelamentoDias: 30,
    valorMensal: 5400,
    formaPagamento: 'Boleto',
    centroCusto: 'CC-2001',
    indiceReajuste: 'Fixo',
    dataBaseReajuste: '2023-03-01',
    obrigacoes: [],
    documentos: [
      { id: id('DOC', 8), nome: 'Apólice.pdf', tipo: 'Contrato', versao: 1, enviadoEm: '2023-03-01', enviadoPor: 'Maria Fernandes' },
    ],
    historico: [
      { id: id('H', 8), tipo: 'Original', dataInicio: '2023-03-01', dataFim: '2024-03-01', valorMensal: 5400 },
    ],
    auditoria: [
      { id: id('A', 10), data: '2023-03-01', usuario: 'Maria Fernandes', acao: 'Cadastrou o contrato' },
      { id: id('A', 11), data: '2024-04-01', usuario: 'Ana Ribeiro', acao: 'Encerrou o contrato — frota vendida' },
    ],
    encerradoEm: '2024-04-01',
  },
]

export function listarContratos(): Contrato[] {
  return CONTRATOS
}

export function buscarContrato(idBuscado: string): Contrato | undefined {
  return CONTRATOS.find((c) => c.id === idBuscado)
}
