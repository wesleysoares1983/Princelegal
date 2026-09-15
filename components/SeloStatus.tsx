import { STATUS_INFO } from '@/lib/status'
import type { Status } from '@/lib/tipos'

export function SeloStatus({ status, rotulo }: { status: Status; rotulo?: string }) {
  const info = STATUS_INFO[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold`}
      style={{
        color: `var(--${info.cor})`,
        backgroundColor: `var(--${info.corFraca})`,
        borderColor: `color-mix(in srgb, var(--${info.cor}) 40%, transparent)`,
      }}
    >
      <span>{info.ponto}</span>
      {rotulo ?? info.rotulo}
    </span>
  )
}
