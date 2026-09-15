'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { estaAutenticado } from '@/lib/auth'

/**
 * Trava o sistema atras do login.
 *
 * A verificacao roda no navegador (nao ha sessao de servidor nesta versao),
 * entao a tela fica em branco por um instante antes do redirecionamento --
 * melhor isso do que mostrar o conteudo e tirar na hora seguinte.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [liberado, setLiberado] = useState(false)

  useEffect(() => {
    if (pathname === '/login') {
      setLiberado(true)
      return
    }
    if (estaAutenticado()) {
      setLiberado(true)
    } else {
      router.replace('/login')
    }
  }, [pathname, router])

  if (pathname === '/login') return <>{children}</>
  if (!liberado) return null
  return <>{children}</>
}
