'use client'

import { usePathname } from 'next/navigation'
import { AuthGuard } from './AuthGuard'
import { BarraTopo } from './BarraTopo'
import { Menu } from './Menu'

/**
 * Moldura da aplicacao (menu + barra), exceto no login.
 *
 * O login e uma tela de entrada, nao uma tela do sistema -- vestir menu e
 * barra de caminho nela ofereceria navegacao para dentro de um app em que a
 * pessoa ainda nao entrou.
 */
export function Casca({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <AuthGuard>
      <div className="flex h-screen">
        <Menu />
        <div className="flex min-w-0 flex-1 flex-col">
          <BarraTopo />
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  )
}
