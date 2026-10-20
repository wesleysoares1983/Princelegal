'use client'

import { useEffect, useMemo, useState } from 'react'
import { listarContratosProtheus, type ContratoProtheus } from '@/lib/contratosProtheus'
import { diasAte } from '@/lib/shared/datas'
import { formatarData, formatarMoeda } from '@/lib/shared/status'

export default function ListaContratosProtheus() {
  const [contratos, setContratos] = useState<ContratoProtheus[]>([])
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filial, setFilial] = useState('todas')
  const [situacao, setSituacao] = useState('todas')
  const [faixa, setFaixa] = useState<'todas' | 'ativos' | 'vence90' | 'vence30' | 'vencidos'>('todas')
  const [campoData, setCampoData] = useState<'dataInicio' | 'dataFim'>('dataFim')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')

  useEffect(() => {
    let cancelado = false
    listarContratosProtheus()
      .then((resposta) => {
        if (cancelado) return
        setContratos(resposta.contratos)
        setAtualizadoEm(resposta.atualizadoEm)
        if (resposta.erro) setErro(resposta.erro)
      })
      .catch(() => {
        if (!cancelado) setErro('Não foi possível carregar os contratos do Protheus.')
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const comDias = useMemo(
    () => contratos.map((c) => ({ c, dias: c.dataFim ? diasAte(c.dataFim) : null })),
    [contratos],
  )

  const resumo = useMemo(() => {
    const vencidos = comDias.filter(({ dias }) => dias !== null && dias < 0)
    const vence30 = comDias.filter(({ dias }) => dias !== null && dias >= 0 && dias <= 30)
    const vence90 = comDias.filter(({ dias }) => dias !== null && dias > 30 && dias <= 90)
    const ativos = comDias.filter(({ dias }) => dias !== null && dias >= 0)
    return {
      ativos: ativos.length,
      vence90: vence90.length,
      vence30: vence30.length,
      vencidos: vencidos.length,
    }
  }, [comDias])

  const filiais = useMemo(
    () => Array.from(new Set(contratos.map((c) => c.filial).filter(Boolean))).sort(),
    [contratos],
  )
  const situacoes = useMemo(
    () => Array.from(new Set(contratos.map((c) => c.situacao).filter(Boolean))).sort(),
    [contratos],
  )

  const filtrados = useMemo(() => {
    const alvo = busca.toLowerCase()
    return comDias
      .filter(({ c, dias }) => {
        const passaBusca = `${c.numero} ${c.cliente} ${c.tipoContrato} ${c.filial}`
          .toLowerCase()
          .includes(alvo)
        const passaFilial = filial === 'todas' || c.filial === filial
        const passaSituacao = situacao === 'todas' || c.situacao === situacao
        const passaFaixa =
          faixa === 'todas' ||
          (dias !== null &&
            ((faixa === 'ativos' && dias >= 0) ||
              (faixa === 'vence90' && dias > 30 && dias <= 90) ||
              (faixa === 'vence30' && dias >= 0 && dias <= 30) ||
              (faixa === 'vencidos' && dias < 0)))
        const valorData = c[campoData]
        const passaDataDe = !dataDe || (valorData && valorData.slice(0, 10) >= dataDe)
        const passaDataAte = !dataAte || (valorData && valorData.slice(0, 10) <= dataAte)
        return passaBusca && passaFilial && passaSituacao && passaFaixa && passaDataDe && passaDataAte
      })
      .map(({ c }) => c)
  }, [comDias, busca, filial, situacao, faixa, campoData, dataDe, dataAte])

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Contratos Protheus</h1>
        <p className="text-[13px] text-tinta-fraca">
          Consulta somente leitura, sincronizada 1x por dia (9h) com a base do Protheus.
          {atualizadoEm && ` Última sincronização: ${new Date(atualizadoEm).toLocaleString('pt-BR')}.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { chave: 'ativos' as const, rotulo: 'Contratos ativos', valor: resumo.ativos, cor: 'text-tinta', quadro: '--marca' },
          { chave: 'vence90' as const, rotulo: 'Vencem em 90 dias', valor: resumo.vence90, cor: 'text-status-atencao', quadro: '--status-atencao' },
          { chave: 'vence30' as const, rotulo: 'Vencem em 30 dias', valor: resumo.vence30, cor: 'text-status-alerta', quadro: '--status-alerta' },
          { chave: 'vencidos' as const, rotulo: 'Vencidos', valor: resumo.vencidos, cor: 'text-status-vencido', quadro: '--status-vencido' },
        ].map((card) => (
          <button
            key={card.chave}
            type="button"
            onClick={() => setFaixa((atual) => (atual === card.chave ? 'todas' : card.chave))}
            className={`grad-quadro rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5 hover:brightness-110 ${
              faixa === card.chave ? 'ring-2 ring-offset-0' : ''
            }`}
            style={
              {
                '--cor-quadro': `var(${card.quadro})`,
                ...(faixa === card.chave ? { '--tw-ring-color': `var(${card.quadro})` } : {}),
              } as React.CSSProperties
            }
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-tinta-fraca">{card.rotulo}</p>
            <p className={`mt-2 text-2xl font-bold ${card.cor}`}>{card.valor}</p>
          </button>
        ))}
      </div>

      {faixa !== 'todas' && (
        <button
          type="button"
          onClick={() => setFaixa('todas')}
          className="text-[12px] text-marca hover:underline"
        >
          × Limpar filtro de vencimento
        </button>
      )}

      {erro && (
        <p className="rounded-md border border-status-vencido/40 bg-status-vencido-fraca px-3 py-2 text-[12px] text-status-vencido">
          {erro}
          {contratos.length > 0 && ' Exibindo os últimos dados sincronizados com sucesso.'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filial}
          onChange={(e) => setFilial(e.target.value)}
          className="rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
        >
          <option value="todas">Todas as filiais</option>
          {filiais.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          className="rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
        >
          <option value="todas">Todas as situações</option>
          {situacoes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={campoData}
          onChange={(e) => setCampoData(e.target.value as 'dataInicio' | 'dataFim')}
          className="rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
        >
          <option value="dataFim">Vencimento</option>
          <option value="dataInicio">Início</option>
        </select>
        <input
          type="date"
          value={dataDe}
          onChange={(e) => setDataDe(e.target.value)}
          className="rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
        />
        <span className="text-[12px] text-tinta-fraca">até</span>
        <input
          type="date"
          value={dataAte}
          onChange={(e) => setDataAte(e.target.value)}
          className="rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta focus:border-marca/60 focus:outline-none"
        />
        {(dataDe || dataAte) && (
          <button
            type="button"
            onClick={() => {
              setDataDe('')
              setDataAte('')
            }}
            className="text-[12px] text-marca hover:underline"
          >
            × Limpar datas
          </button>
        )}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, cliente, contrato ou filial…"
          className="ml-auto w-72 max-w-full rounded-md border border-borda bg-painel px-3 py-1.5 text-[12px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none"
        />
      </div>

      <div className="grad-quadro overflow-hidden rounded-xl border" style={{ '--cor-quadro': 'var(--marca)' } as React.CSSProperties}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-tinta-fraca">
                <th className="px-4 py-2 font-medium">Número</th>
                <th className="px-4 py-2 font-medium">Cliente</th>
                <th className="px-4 py-2 font-medium">Contrato</th>
                <th className="px-4 py-2 font-medium">Filial</th>
                <th className="px-4 py-2 font-medium">Início</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Valor atual</th>
                <th className="px-4 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-tinta-fraca">
                    Carregando contratos do Protheus…
                  </td>
                </tr>
              )}
              {!carregando &&
                filtrados.map((c) => (
                  <tr key={c.numero} className="border-t border-borda hover:bg-painel-2">
                    <td className="px-4 py-2 font-mono text-[11px] text-tinta-fraca">{c.numero}</td>
                    <td className="px-4 py-2 font-medium text-tinta">{c.cliente}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.tipoContrato}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.filial}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.dataInicio ? formatarData(c.dataInicio) : '—'}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.dataFim ? formatarData(c.dataFim) : '—'}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{formatarMoeda(c.valorAtual)}</td>
                    <td className="px-4 py-2 text-tinta-fraca">{c.situacao}</td>
                  </tr>
                ))}
              {!carregando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-tinta-fraca">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
