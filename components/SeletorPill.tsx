import type { SelectHTMLAttributes } from 'react'

/**
 * Select no padrao "pill" escuro da paleta: fundo do painel, borda sutil,
 * seta propria (o navegador some com a nativa via `appearance-none`).
 *
 * Mesmo visual do seletor de periodo dos combos de grafico da I.A (Financeiro
 * & Controladoria) -- aqui so a cor e a forma, sem o grafico.
 */
export function SeletorPill(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...resto } = props
  return (
    <div className="relative inline-block w-full">
      <select
        {...resto}
        className={`w-full appearance-none rounded-full border border-borda bg-painel-2 py-1.5 pl-3 pr-8 text-[12px] font-medium text-tinta transition-colors focus:border-roxo/60 focus:outline-none ${className}`}
      />
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tinta-fraca"
        aria-hidden
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  )
}
