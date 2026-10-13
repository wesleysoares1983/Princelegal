'use client'

import { useState } from 'react'
import { baixarArquivo } from '@/lib/api/cliente'

/**
 * Exportar a lista como está na tela (mesmos filtros) para Excel ou CSV.
 * `caminho` é o endpoint sem `formato`, ex.: `/contratos/exportar?status=vencido`.
 */
export function BotaoExportar({ caminho, rotulo = 'Exportar' }: { caminho: string; rotulo?: string }) {
  const [baixando, setBaixando] = useState<'xlsx' | 'csv' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function exportar(formato: 'xlsx' | 'csv') {
    setBaixando(formato)
    setErro(null)
    try {
      await baixarArquivo(`${caminho}${caminho.includes('?') ? '&' : '?'}formato=${formato}`, `exportacao.${formato}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível exportar.')
    } finally {
      setBaixando(null)
    }
  }

  const classe =
    'border-borda px-2.5 py-1.5 text-[11px] font-medium text-tinta-fraca transition-colors hover:bg-painel-2 hover:text-tinta disabled:opacity-60'
  return (
    <div className="relative flex items-center">
      <span className="mr-2 text-[11px] text-tinta-fraca">{rotulo}:</span>
      <div className="inline-flex overflow-hidden rounded-md border border-borda">
        <button type="button" onClick={() => exportar('xlsx')} disabled={baixando !== null} className={classe} title="Planilha do Excel (.xlsx)">
          {baixando === 'xlsx' ? 'Gerando…' : 'Excel'}
        </button>
        <button type="button" onClick={() => exportar('csv')} disabled={baixando !== null} className={`border-l ${classe}`} title="CSV para Excel (separado por ponto e vírgula)">
          {baixando === 'csv' ? 'Gerando…' : 'CSV'}
        </button>
      </div>
      {erro && <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-72 rounded-md border border-status-vencido/40 bg-painel p-2 text-[11px] text-status-vencido shadow">{erro}</p>}
    </div>
  )
}
