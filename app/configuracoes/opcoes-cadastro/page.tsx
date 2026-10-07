'use client'

import { useState } from 'react'
import { ErroDaApi } from '@/lib/api/cliente'
import { useCriarOpcao, useDesativarOpcao, useOpcoesAdmin, useReativarOpcao, useRenomearOpcao } from '@/lib/api/opcoes'
import { CAMPOS_OPCAO, TITULO_CAMPO, type CampoOpcao, type Opcao } from '@/lib/shared/opcoes'

/**
 * Opções de cadastro (só administrador; o proxy e a API barram os demais).
 *
 * "Remover" desativa: a opção some dos formulários novos, mas os contratos
 * que já a usam continuam mostrando-a. Inativas ficam listadas à parte, com
 * "Reativar". Clicar no nome renomeia -- e o nome novo vale para todos os
 * contratos que usam a opção.
 */

const classeInput =
  'w-full rounded-md border border-borda bg-painel-2 px-3 py-2 text-[13px] text-tinta placeholder:text-tinta-fraca focus:border-marca/60 focus:outline-none'

const ICONE_CAMPO: Record<CampoOpcao, string> = {
  categoria: 'M20.6 12.6L12 21.2 2.8 12 11.4 3.4a2 2 0 011.4-.6H19a2 2 0 012 2v5.2a2 2 0 01-.6 1.4zM16.5 7.5h.01',
  segmento: 'M3 8l9-4 9 4-9 4zM3 8v8l9 4 9-4V8M12 12v8',
  empresa: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  filial: 'M4 21V4a1 1 0 011-1h9a1 1 0 011 1v17M4 21h16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1M19 21V11l-4-2',
  'centro-custo': 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  'area-responsavel': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
}

/** Erro mostrado no painel; `reativarId` quando o valor já existe como inativo. */
interface Aviso {
  mensagem: string
  reativarId?: string
}

function avisoDoErro(erro: unknown): Aviso {
  if (erro instanceof ErroDaApi) {
    const d = erro.detalhes as { id?: string; ativo?: boolean } | undefined
    const mensagem = erro.campos.valor ?? erro.message
    return erro.codigo === 'CONFLITO' && d?.ativo === false && d.id ? { mensagem, reativarId: d.id } : { mensagem }
  }
  return { mensagem: 'Erro inesperado. Tente novamente.' }
}

function ChipOpcao({
  opcao,
  ocupado,
  onRenomear,
  onDesativar,
}: {
  opcao: Opcao
  ocupado: boolean
  onRenomear: (valor: string) => Promise<boolean>
  onDesativar: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(opcao.valor)

  async function salvar() {
    const limpo = valor.trim()
    if (!limpo || limpo === opcao.valor) {
      setEditando(false)
      setValor(opcao.valor)
      return
    }
    if (await onRenomear(limpo)) setEditando(false)
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={valor}
        disabled={ocupado}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar()
          if (e.key === 'Escape') {
            setValor(opcao.valor)
            setEditando(false)
          }
        }}
        aria-label={`Novo nome para ${opcao.valor}`}
        className="rounded-full border border-marca/60 bg-painel px-3 py-1 text-[12px] text-tinta focus:outline-none"
        style={{ width: `${Math.max(valor.length, 6) + 3}ch` }}
      />
    )
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-borda bg-painel py-1 pl-3 pr-1.5 text-[12px] text-tinta">
      <button
        type="button"
        onClick={() => {
          setValor(opcao.valor)
          setEditando(true)
        }}
        title="Clique para renomear"
        className="hover:text-marca"
      >
        {opcao.valor}
      </button>
      <button
        type="button"
        onClick={onDesativar}
        disabled={ocupado}
        aria-label={`Desativar ${opcao.valor}`}
        title="Desativar (some dos formulários novos; contratos que já usam continuam mostrando)"
        className="grid h-4 w-4 place-items-center rounded-full text-tinta-fraca hover:bg-status-vencido/20 hover:text-status-vencido disabled:opacity-40"
      >
        ×
      </button>
    </span>
  )
}

function PainelOpcaoCadastro({ campo, opcoes }: { campo: CampoOpcao; opcoes: Opcao[] }) {
  const titulo = TITULO_CAMPO[campo]
  const [novo, setNovo] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [verInativas, setVerInativas] = useState(false)

  const criar = useCriarOpcao()
  const renomear = useRenomearOpcao()
  const desativar = useDesativarOpcao()
  const reativar = useReativarOpcao()
  const ocupado = criar.isPending || renomear.isPending || desativar.isPending || reativar.isPending

  const ativas = opcoes.filter((o) => o.ativo)
  const inativas = opcoes.filter((o) => !o.ativo)

  async function executar(acao: () => Promise<unknown>): Promise<boolean> {
    setAviso(null)
    try {
      await acao()
      return true
    } catch (erro) {
      setAviso(avisoDoErro(erro))
      return false
    }
  }

  async function adicionar() {
    if (!novo.trim() || ocupado) return
    if (await executar(() => criar.mutateAsync({ campo, valor: novo }))) setNovo('')
  }

  return (
    <div className="rounded-lg border border-borda bg-painel-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--roxo) 18%, transparent)', color: 'var(--roxo)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONE_CAMPO[campo]} />
          </svg>
        </span>
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-tinta-fraca">{titulo}</p>
        <span className="ml-auto text-[10px] text-tinta-fraca/70">
          {ativas.length} {ativas.length === 1 ? 'ativa' : 'ativas'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ativas.length === 0 && <p className="text-[11px] text-tinta-fraca/70">Nenhuma opção ativa.</p>}
        {ativas.map((o) => (
          <ChipOpcao
            key={o.id}
            opcao={o}
            ocupado={ocupado}
            onRenomear={(valor) => executar(() => renomear.mutateAsync({ id: o.id, versao: o.versao, valor }))}
            onDesativar={() => executar(() => desativar.mutateAsync(o.id))}
          />
        ))}
      </div>

      {inativas.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setVerInativas((v) => !v)}
            className="text-[11px] text-tinta-fraca hover:text-tinta"
            aria-expanded={verInativas}
          >
            {verInativas ? '▾' : '▸'} Inativas ({inativas.length})
          </button>
          {verInativas && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {inativas.map((o) => (
                <span
                  key={o.id}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-borda py-1 pl-3 pr-1.5 text-[12px] text-tinta-fraca line-through decoration-tinta-fraca/40"
                >
                  {o.valor}
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => executar(() => reativar.mutateAsync(o.id))}
                    className="rounded-full px-1.5 text-[10px] font-semibold text-marca no-underline hover:bg-marca/10 disabled:opacity-40"
                    style={{ textDecoration: 'none' }}
                  >
                    Reativar
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          className={classeInput}
          placeholder={`Nova opção de ${titulo.toLowerCase()}`}
          value={novo}
          maxLength={100}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-marca px-4 py-2 text-[12px] font-semibold text-marca-tinta transition-opacity disabled:opacity-40"
          disabled={!novo.trim() || ocupado}
          onClick={adicionar}
        >
          Adicionar
        </button>
      </div>

      {aviso && (
        <p role="alert" className="mt-2 text-[11px] text-status-vencido">
          {aviso.mensagem}{' '}
          {aviso.reativarId && (
            <button
              type="button"
              disabled={ocupado}
              onClick={async () => {
                if (await executar(() => reativar.mutateAsync(aviso.reativarId!))) setNovo('')
              }}
              className="font-semibold text-marca underline"
            >
              Reativar agora
            </button>
          )}
        </p>
      )}
    </div>
  )
}

export default function OpcoesDeCadastro() {
  const { data, isPending, isError, error, refetch } = useOpcoesAdmin()

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
          Clique no nome para renomear (vale para todos os contratos). O × desativa: a opção some dos formulários novos, mas
          os contratos que já a usam continuam mostrando-a.
        </p>

        {isPending && <p className="text-[12px] text-tinta-fraca">Carregando…</p>}
        {isError && (
          <p role="alert" className="text-[12px] text-status-vencido">
            {error instanceof Error ? error.message : 'Não foi possível carregar as opções.'}{' '}
            <button type="button" onClick={() => refetch()} className="font-semibold underline">
              Tentar de novo
            </button>
          </p>
        )}
        {data && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CAMPOS_OPCAO.map((campo) => (
              <PainelOpcaoCadastro key={campo} campo={campo} opcoes={data[campo] ?? []} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
