'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AREAS, type Subitem } from '@/lib/areas'
import { sair } from '@/lib/auth'
import { Marca } from './Marca'

const ICONES: Record<string, string> = {
  livro: 'M4 4h11a3 3 0 013 3v13H7a3 3 0 01-3-3zM7 20a3 3 0 01-3-3M8 8h7M8 12h7',
  lista: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sino: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  sair: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  relogio: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2',
  casa: 'M4 11l8-7 8 7M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9M10 20v-5h4v5',
  engrenagem:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  ajuda: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01',
}

const LARGA = 'w-60'
const ESTREITA = 'w-[60px]'

/** Itens do rodape do menu -- fora de `AREAS` porque ficam abaixo das ondas
 *  decorativas, e nao entre "Início" e "Gestão". Configurações abre em dois
 *  subitens, no mesmo padrao de expandir/recolher das areas de negocio. */
const RODAPE: Subitem[] = [
  {
    href: '/configuracoes/usuarios',
    nome: 'Configurações',
    icone: 'engrenagem',
    itens: [
      { href: '/configuracoes/usuarios', nome: 'Cadastro de Usuários' },
      { href: '/configuracoes/opcoes-cadastro', nome: 'Opções de cadastro' },
    ],
  },
  { href: '/ajuda', nome: 'Ajuda', icone: 'ajuda' },
]

function Icone({ nome }: { nome: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d={ICONES[nome] ?? ICONES.lista} />
    </svg>
  )
}

function Ramo({ item, caminho }: { item: Subitem; caminho: string }) {
  const naTela = caminho === item.href
  return (
    <Link
      href={item.href}
      aria-current={naTela ? 'page' : undefined}
      className={`block truncate rounded-md px-2 py-[7px] text-[11px] transition-colors ${
        naTela ? 'bg-painel-2 font-semibold text-tinta' : 'text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
      }`}
    >
      {item.nome}
    </Link>
  )
}

export function Menu() {
  const caminho = usePathname()
  const router = useRouter()
  const [encolhido, setEncolhido] = useState(false)
  const [abertas, setAbertas] = useState<string[]>([])

  const naArea = (slug: string) => caminho === `/${slug}` || caminho.startsWith(`/${slug}/`)

  useEffect(() => {
    try {
      const salvo = localStorage.getItem('menu')
      if (salvo) {
        const { abertas: a, encolhido: e } = JSON.parse(salvo)
        if (Array.isArray(a)) setAbertas(a)
        setEncolhido(!!e)
      }
    } catch {
      // Armazenamento bloqueado: abre no padrao.
    }
  }, [])

  function guardar(proximas: string[], proximoEncolhido: boolean) {
    try {
      localStorage.setItem('menu', JSON.stringify({ abertas: proximas, encolhido: proximoEncolhido }))
    } catch {
      // idem
    }
  }

  const areaAtual = AREAS.find((a) => naArea(a.slug))?.slug ?? null
  const ultimaArea = useRef<string | null>(null)
  useEffect(() => {
    if (!areaAtual || ultimaArea.current === areaAtual) return
    ultimaArea.current = areaAtual
    setAbertas((atuais) => (atuais.includes(areaAtual) ? atuais : [...atuais, areaAtual]))
  }, [areaAtual])

  const alternarSecao = (slug: string) =>
    setAbertas((atuais) => {
      const proximas = atuais.includes(slug) ? atuais.filter((s) => s !== slug) : [...atuais, slug]
      guardar(proximas, encolhido)
      return proximas
    })

  function alternarLargura() {
    setEncolhido((atual) => {
      guardar(abertas, !atual)
      return !atual
    })
  }

  return (
    <nav
      className={`menu-degrade flex ${encolhido ? ESTREITA : LARGA} shrink-0 flex-col overflow-y-auto border-r border-borda transition-[width] duration-150`}
      aria-label="Areas"
    >
      <div className={`relative flex items-center border-b border-borda px-2 py-3 ${encolhido ? 'justify-center' : ''}`}>
        <button
          type="button"
          onClick={alternarLargura}
          title={encolhido ? 'Expandir o menu' : 'Encolher o menu'}
          aria-label={encolhido ? 'Expandir o menu' : 'Encolher o menu'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-tinta ${encolhido ? '' : 'absolute left-1.5 top-3'}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        {!encolhido && (
          <Link href="/" className="mx-auto block">
            <Marca />
          </Link>
        )}
      </div>

      <div className="py-2">
        <div className="px-2 py-[2px]">
          <Link
            href="/"
            title={encolhido ? 'Início' : undefined}
            aria-current={caminho === '/' ? 'page' : undefined}
            className={`flex min-w-0 items-center gap-[10px] rounded-md px-2 py-[9px] text-[11px] transition-colors ${
              caminho === '/' ? 'menu-ativo font-semibold text-marca' : 'text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
            } ${encolhido ? 'justify-center' : ''}`}
          >
            <Icone nome="casa" />
            {!encolhido && <span className="truncate uppercase tracking-[0.06em]">Início</span>}
          </Link>
        </div>

        {!encolhido && (
          <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-tinta-fraca/60">Gestão</p>
        )}

        {AREAS.map((area) => {
          const atual = naArea(area.slug)
          const aberta = abertas.includes(area.slug)
          const temFilhos = !!area.subitens?.length

          return (
            <div key={area.slug} className="px-2 py-[2px]">
              <div className="flex items-stretch gap-1">
                <Link
                  href={area.subitens?.[0]?.href ?? `/${area.slug}`}
                  onClick={() => temFilhos && alternarSecao(area.slug)}
                  title={encolhido ? area.nome : undefined}
                  aria-current={atual ? 'page' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-[10px] rounded-md px-2 py-[9px] text-[11px] transition-colors ${
                    atual ? 'menu-ativo font-semibold text-marca' : 'text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
                  } ${encolhido ? 'justify-center' : ''}`}
                >
                  <Icone nome={area.icone} />
                  {!encolhido && <span className="truncate uppercase tracking-[0.06em]">{area.nome}</span>}
                </Link>

                {temFilhos && !encolhido && (
                  <button
                    type="button"
                    onClick={() => alternarSecao(area.slug)}
                    aria-expanded={aberta}
                    aria-label={`${aberta ? 'Recolher' : 'Expandir'} ${area.nome}`}
                    className="flex w-7 shrink-0 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-tinta"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" className={`transition-transform ${aberta ? 'rotate-90' : ''}`}>
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>

              {temFilhos && !encolhido && aberta && (
                <div className="ml-[17px] mt-[2px] flex flex-col border-l border-borda pl-2">
                  {area.subitens!.map((sub) => (
                    <Ramo key={sub.href} item={sub} caminho={caminho} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Espaco vazio da lateral: ondas verdes de fundo com a frase da marca,
          no mesmo lugar em que o Princevision usa esse detalhe. */}
      {!encolhido && (
        <div className="relative min-h-[150px] flex-1 overflow-hidden">
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 w-full text-marca/50"
            height="140"
            viewBox="0 0 240 140"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d="M-10 40c30-28 60-28 90 0s60 28 90 0 60-28 90 0" stroke="currentColor" strokeWidth="1.3" />
            <path d="M-10 55c30-28 60-28 90 0s60 28 90 0 60-28 90 0" stroke="currentColor" strokeWidth="1.1" opacity="0.75" />
            <path d="M-10 70c30-28 60-28 90 0s60 28 90 0 60-28 90 0" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
            <path d="M-10 85c30-28 60-28 90 0s60 28 90 0 60-28 90 0" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          </svg>
          <p className="absolute bottom-4 left-4 right-4 text-[11px] italic leading-snug text-tinta-fraca">
            "Prazo lembrado é prazo cumprido."
            <br />
            <span className="not-italic text-tinta-fraca/70">Contratos Jurídicos</span>
          </p>
        </div>
      )}

      <div className="border-t border-borda py-2">
        {RODAPE.map((it) => {
          const temFilhos = !!it.itens?.length
          const atual = temFilhos ? caminho.startsWith('/configuracoes') : caminho === it.href
          const aberto = abertas.includes(it.href)

          return (
            <div key={it.href} className="px-2 py-[2px]">
              <div className="flex items-stretch gap-1">
                <Link
                  href={it.href}
                  onClick={() => temFilhos && alternarSecao(it.href)}
                  title={encolhido ? it.nome : undefined}
                  aria-current={atual ? 'page' : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-[10px] rounded-md px-2 py-[9px] text-[11px] transition-colors ${
                    atual ? 'menu-ativo font-semibold text-marca' : 'text-tinta-fraca hover:bg-painel-2 hover:text-tinta'
                  } ${encolhido ? 'justify-center' : ''}`}
                >
                  <Icone nome={it.icone ?? 'lista'} />
                  {!encolhido && <span className="truncate">{it.nome}</span>}
                </Link>

                {temFilhos && !encolhido && (
                  <button
                    type="button"
                    onClick={() => alternarSecao(it.href)}
                    aria-expanded={aberto}
                    aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${it.nome}`}
                    className="flex w-7 shrink-0 items-center justify-center rounded-md text-tinta-fraca hover:bg-painel-2 hover:text-tinta"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" className={`transition-transform ${aberto ? 'rotate-90' : ''}`}>
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>

              {temFilhos && !encolhido && (aberto || atual) && (
                <div className="ml-[17px] mt-[2px] flex flex-col border-l border-borda pl-2">
                  {it.itens!.map((sub) => (
                    <Ramo key={sub.href} item={sub} caminho={caminho} />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="px-2 py-[2px]">
          <button
            type="button"
            onClick={() => {
              sair()
              router.replace('/login')
            }}
            title={encolhido ? 'Sair' : undefined}
            className={`flex w-full min-w-0 items-center gap-[10px] rounded-md px-2 py-[9px] text-[11px] text-tinta-fraca transition-colors hover:bg-painel-2 hover:text-status-vencido ${
              encolhido ? 'justify-center' : ''
            }`}
          >
            <Icone nome="sair" />
            {!encolhido && <span className="truncate">Sair</span>}
          </button>
        </div>
      </div>
    </nav>
  )
}
