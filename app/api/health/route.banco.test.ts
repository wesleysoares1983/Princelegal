import { afterAll, describe, expect, it } from 'vitest'
import { fecharBanco } from '@/lib/server/db/cliente'
import { GET } from './route'

afterAll(fecharBanco)

describe('GET /api/health', () => {
  it('200 com o banco no ar, sem cache', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
