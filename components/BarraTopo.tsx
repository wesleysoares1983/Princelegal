'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AREAS } from '@/lib/areas'
import { sair, useUsuario } from './ProvedorUsuario'

export function BarraTopo() {
  const caminho = usePathname()
  const area = AREAS.find((a) => caminho === `/${a.slug}` || caminho.startsWith(`/${a.slug}/`))
  const sub = area?.subitens?.find((s) => caminho === s.href)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-borda bg-nav px-5">
      <nav className="flex min-w-0 items-center gap-2 text-[13px]" aria-label="Caminho">
        <Link href="/" className="shrink-0 text-tinta-fraca hover:text-tinta">
          Contratos Jurídicos
        </Link>
        {area && (
          <>
            <span className="text-tinta-fraca/50">/</span>
            <span className={`shrink-0 ${sub ? 'text-tinta-fraca' : 'font-semibold text-tinta'}`}>{area.nome}</span>
          </>
        )}
        {sub && (
          <>
            <span className="text-tinta-fraca/50">/</span>
            <span className="truncate font-semibold text-tinta">{sub.nome}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <BotaoTema />
        <BotaoSair />
      </div>
    </header>
  )
}

/**
 * Quem esta logado, "Alterar senha" e "Sair".
 *
 * A senha mora no cadastro central (Apps Princesa): trocar e o mesmo fluxo de
 * "esqueci minha senha" de la, aberto em outra aba para nao perder a tela atual.
 */
function BotaoSair() {
  const usuario = useUsuario()

  return (
    <div className="flex items-center gap-2 border-l border-borda pl-3">
      {usuario && (
        <span className="hidden max-w-[180px] truncate text-[11px] text-tinta-fraca sm:inline" title={`${usuario.email} · matrícula ${usuario.matricula}`}>
          {usuario.nome}
        </span>
      )}
      <a
        href="/api/auth/esqueci-senha"
        target="_blank"
        rel="noopener noreferrer"
        title="Alterar senha"
        aria-label="Alterar senha"
        className="flex h-7 w-7 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-tinta"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      </a>
      <button
        type="button"
        onClick={sair}
        title="Sair"
        aria-label="Sair"
        className="flex h-7 w-7 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-status-vencido"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      </button>
    </div>
  )
}

function BotaoTema() {
  const [claro, setClaro] = useState(false)

  useEffect(() => {
    setClaro(document.documentElement.dataset.tema === 'claro')
  }, [])

  function alternar() {
    const proximo = !claro
    setClaro(proximo)
    const raiz = document.documentElement
    if (proximo) raiz.dataset.tema = 'claro'
    else delete raiz.dataset.tema
    try {
      localStorage.setItem('tema', proximo ? 'claro' : 'escuro')
    } catch {
      // Armazenamento bloqueado: vale para esta aba.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={claro ? 'Usar o tema escuro' : 'Usar o tema claro'}
      aria-label={claro ? 'Usar o tema escuro' : 'Usar o tema claro'}
      aria-pressed={claro}
      className="flex h-7 w-7 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-tinta"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {claro ? (
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </>
        )}
      </svg>
    </button>
  )
}
