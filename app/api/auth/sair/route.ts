import { NextResponse, type NextRequest } from 'next/server'
import { limparSessao, origemConfere } from '@/lib/server/sessao'

/** POST /api/auth/sair -- apaga o cookie de sessao. Os Apps Princesa nao guardam sessao, nao ha o que avisar la. */
export async function POST(req: NextRequest) {
  if (!origemConfere(req)) return NextResponse.json({ ok: false }, { status: 403 })
  const res = NextResponse.json({ ok: true })
  limparSessao(res)
  return res
}
