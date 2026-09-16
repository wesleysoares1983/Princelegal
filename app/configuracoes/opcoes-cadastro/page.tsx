'use client'

import { useEffect, useState } from 'react'
import { adicionarOpcao, CAMPOS_CADASTRO, lerOpcoes, removerOpcao } from '@/lib/config/opcoesCadastro'

const classeInput =
  'w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const ICONE_CAMPO: Record<string, string> = {
  categoria: 'M20.6 12.6L12 21.2 2.8 12 11.4 3.4a2 2 0 011.4-.6H19a2 2 0 012 2v5.2a2 2 0 01-.6 1.4zM16.5 7.5h.01',
  segmento: 'M3 8l9-4 9 4-9 4zM3 8v8l9 4 9-4V8M12 12v8',
  empresa: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  filial: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  'centro-custo': 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  'area-responsavel': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
}

function PainelOpcaoCadastro({ campo }: { campo: { id: string; titulo: string } }) {
  const [, forcar] = useState(0)
  const [novo, setNovo] = useState('')
  const opcoes = lerOpcoes(campo.id)

  useEffect(() => {
    const recarregar = () => forcar((n) => n + 1)
    window.addEventListener('cj:config', recarregar)
    return () => window.removeEventListener('cj:config', recarregar)
  }, [])

  function adicionar() {
    if (!novo.trim()) return
    adicionarOpcao(campo.id, novo)
    setNovo('')
  }

  return (
    <div className="rounded-lg border border-borda bg-painel-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--roxo) 18%, transparent)', color: 'var(--roxo)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONE_CAMPO[campo.id] ?? ICONE_CAMPO.categoria} />
          </svg>
        </span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">{campo.titulo}</p>
        <span className="ml-auto text-[10px] text-tinta-fraca/70">{opcoes.length} opções</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {opcoes.length === 0 && <p className="text-[11px] text-tinta-fraca/70">Nenhuma opção cadastrada ainda.</p>}
        {opcoes.map((o) => (
          <span
            key={o}
            className="flex items-center gap-1.5 rounded-full border border-borda bg-painel py-1 pl-3 pr-1.5 text-[12px] text-tinta"
          >
            {o}
            <button
              type="button"
              onClick={() => removerOpcao(campo.id, o)}
              aria-label={`Remover ${o}`}
              className="grid h-4 w-4 place-items-center rounded-full text-tinta-fraca hover:bg-status-vencido/20 hover:text-status-vencido"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className={classeInput}
          placeholder={`Nova opção de ${campo.titulo.toLowerCase()}`}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta transition-opacity disabled:opacity-40"
          disabled={!novo.trim()}
          onClick={adicionar}
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}

export default function OpcoesDeCadastro() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Configurações</h1>
        <p className="text-[13px] text-tinta-fraca">
          Opções de Categoria, Segmento, Empresa, Filial, Centro de Custo e Área Responsável usadas no cadastro de contratos.
        </p>
      </div>

      <section className="grad-quadro rounded-xl border p-5" style={{ '--cor-quadro': 'var(--roxo)' } as React.CSSProperties}>
        <h2 className="text-[13px] font-semibold text-tinta">Opções de cadastro</h2>
        <p className="mb-4 text-[12px] text-tinta-fraca">
          Categoria, Segmento, Empresa, Filial, Centro de Custo e Área Responsável que aparecem no formulário de
          Novo Contrato.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CAMPOS_CADASTRO.map((campo) => (
            <PainelOpcaoCadastro key={campo.id} campo={campo} />
          ))}
        </div>
      </section>
    </div>
  )
}
