/**
 * Obrigacoes de todos os contratos, num lugar so.
 *
 * O cadastro de obrigacoes (com recorrencia mensal/anual) ainda nao existe no
 * backend; ate la a tela avisa em vez de mostrar dado de exemplo.
 */
export default function Obrigacoes() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-tinta">Obrigações</h1>
        <p className="text-[13px] text-tinta-fraca">Pagamentos, seguros, avisos e demais compromissos de cada contrato.</p>
      </div>
      <div className="grad-quadro rounded-xl border p-8 text-center text-[13px] text-tinta-fraca" style={{ '--cor-quadro': 'var(--status-atencao)' } as React.CSSProperties}>
        O registro de obrigações ainda não está disponível. Em breve será possível cadastrá-las em cada contrato e acompanhar aqui o que está pendente.
      </div>
    </div>
  )
}
