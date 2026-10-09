'use client'

/**
 * Carregando / erro de uma consulta, no mesmo visual em todas as telas.
 * Erro mostra a mensagem da API e um "Tentar de novo".
 */
export function EstadoConsulta({
  carregando,
  erro,
  tentarDeNovo,
}: {
  carregando: boolean
  erro: unknown
  tentarDeNovo?: () => void
}) {
  if (carregando) return <p className="py-6 text-center text-[12px] text-tinta-fraca">Carregando…</p>
  if (!erro) return null
  return (
    <p role="alert" className="py-6 text-center text-[12px] text-status-vencido">
      {erro instanceof Error ? erro.message : 'Não foi possível carregar.'}{' '}
      {tentarDeNovo && (
        <button type="button" onClick={tentarDeNovo} className="font-semibold underline">
          Tentar de novo
        </button>
      )}
    </p>
  )
}
