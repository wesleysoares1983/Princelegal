'use client'

import { useState } from 'react'

/**
 * Marca no topo do menu: a coroa da Princesa dos Campos, igual ao Princevision,
 * com o nome do sistema jurídico abaixo dela.
 *
 * Usa `public/coroa-princesa.png` (copiado do Princevision). Enquanto o
 * arquivo nao estiver la, cai no icone de pasta -- melhor uma marca ausente e
 * honesta do que um desenho "parecido" que ninguem aprovou.
 */
export function Marca() {
  const [semArquivo, setSemArquivo] = useState(false)

  return (
    <div className="flex flex-col items-center gap-2">
      {semArquivo ? (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-marca/40 bg-marca-fraca text-marca">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3z" />
            <path d="M7 20a3 3 0 01-3-3" />
            <path d="M8 8h7M8 12h7M8 16h4" />
          </svg>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/coroa-princesa.png"
          alt="Princesa dos Campos"
          className="h-11 w-auto max-w-[70px] object-contain"
          onError={() => setSemArquivo(true)}
        />
      )}

      <div className="text-center leading-tight">
        <p className="text-[12px] font-extrabold tracking-[0.1em] text-tinta">PRINCELEGAL</p>
        <p className="text-[8px] uppercase leading-tight tracking-[0.04em] text-marca">Jurídico</p>
      </div>
    </div>
  )
}
