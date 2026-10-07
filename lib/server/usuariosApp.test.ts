import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsuarioSessao } from '@/lib/usuario'
import type { ListagemDoApp, UsuarioDoApp } from './appsPrincesa'

// Hoisted: o mesmo mock sobrevive ao vi.resetModules() de cada teste.
const listar = vi.hoisted(() => vi.fn<() => Promise<ListagemDoApp | null>>())
vi.mock('./appsPrincesa', () => ({ listarUsuariosDoApp: listar }))

const ANA: UsuarioDoApp = {
  matricula: '100',
  nome: 'Ana Ribeiro',
  email: 'ana@empresa.com',
  perfil: 'Jurídico',
  cargo: 'ADMIN',
  ativo: true,
  criadoEm: null,
}

const listagem = (...usuarios: UsuarioDoApp[]): ListagemDoApp => ({
  app: { id: 10, nome: 'Contratos', ativo: true },
  cargos: [],
  usuarios,
})

const sessaoDe = (u: UsuarioDoApp, extra: Partial<UsuarioSessao> = {}): UsuarioSessao => ({
  matricula: u.matricula,
  nome: u.nome,
  email: u.email,
  perfil: u.perfil,
  cargo: u.cargo,
  nivel: u.cargo === 'ADMIN' ? 'admin' : 'user',
  ...extra,
})

/** O modulo guarda a copia em globalThis: zera entre testes e reimporta. */
async function modulo() {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('contratos-juridicos.usuariosApp')]
  vi.resetModules()
  return import('./usuariosApp')
}

beforeEach(() => {
  listar.mockReset()
  vi.useRealTimers()
})

describe('revalidarSessao', () => {
  it('sessão igual ao cadastro central -> ok', async () => {
    listar.mockResolvedValue(listagem(ANA))
    const { revalidarSessao } = await modulo()
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'ok' })
  })

  it('cargo mudou -> atualizado, com o nível recalculado', async () => {
    listar.mockResolvedValue(listagem({ ...ANA, cargo: 'USUARIO' }))
    const { revalidarSessao } = await modulo()
    const r = await revalidarSessao(sessaoDe(ANA))
    expect(r.tipo).toBe('atualizado')
    expect(r.tipo === 'atualizado' && r.usuario).toMatchObject({ cargo: 'USUARIO', nivel: 'user' })
  })

  it('inativo no cadastro central -> revogado', async () => {
    listar.mockResolvedValue(listagem({ ...ANA, ativo: false }))
    const { revalidarSessao } = await modulo()
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'revogado' })
  })

  it('fora da lista do app -> revogado', async () => {
    listar.mockResolvedValue(listagem())
    const { revalidarSessao } = await modulo()
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'revogado' })
  })

  it('Apps Princesa fora do ar e sem cópia -> ok (falha aberta)', async () => {
    listar.mockResolvedValue(null)
    const { revalidarSessao } = await modulo()
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'ok' })
  })

  it('cópia antiga não expulsa quem acabou de ganhar acesso: busca de novo antes', async () => {
    vi.useFakeTimers()
    listar.mockResolvedValueOnce(listagem()) // cópia sem a Ana
    const { revalidarSessao, obterUsuariosDoApp } = await modulo()
    await obterUsuariosDoApp()
    vi.advanceTimersByTime(60_000) // cópia com mais de 30 s
    listar.mockResolvedValueOnce(listagem(ANA)) // agora ela tem acesso
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'ok' })
    expect(listar).toHaveBeenCalledTimes(2)
  })

  it('cópia antiga e API caída na nova busca -> não expulsa', async () => {
    vi.useFakeTimers()
    listar.mockResolvedValueOnce(listagem())
    const { revalidarSessao, obterUsuariosDoApp } = await modulo()
    await obterUsuariosDoApp()
    vi.advanceTimersByTime(60_000)
    listar.mockResolvedValueOnce(null)
    expect(await revalidarSessao(sessaoDe(ANA))).toEqual({ tipo: 'ok' })
  })
})

describe('obterUsuariosDoApp (cache)', () => {
  it('chamadas simultâneas dividem a mesma busca', async () => {
    listar.mockResolvedValue(listagem(ANA))
    const { obterUsuariosDoApp } = await modulo()
    await Promise.all([obterUsuariosDoApp(), obterUsuariosDoApp(), obterUsuariosDoApp()])
    expect(listar).toHaveBeenCalledTimes(1)
  })

  it('cópia vencida: devolve a antiga na hora e atualiza por trás', async () => {
    vi.useFakeTimers()
    listar.mockResolvedValueOnce(listagem(ANA))
    const { obterUsuariosDoApp } = await modulo()
    await obterUsuariosDoApp()
    vi.advanceTimersByTime(6 * 60_000)
    listar.mockResolvedValueOnce(listagem())
    const devolvida = await obterUsuariosDoApp()
    expect(devolvida?.usuarios).toHaveLength(1) // ainda a antiga
    await vi.waitFor(() => expect(listar).toHaveBeenCalledTimes(2))
  })
})
