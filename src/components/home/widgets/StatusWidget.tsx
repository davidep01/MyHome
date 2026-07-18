import { useHomeStatus } from '../../../hooks/useHomeStatus'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'
import type { WidgetSize } from '../../../api/backend'

const TONE_BG: Record<string, string> = {
  ok: 'rgba(21,128,61,0.12)',
  warning: 'rgba(194,65,12,0.14)',
  critical: 'rgba(220,38,38,0.14)',
}

export function StatusWidget({ size }: { size: WidgetSize }) {
  const status = useHomeStatus()
  const Icon = status.Icon

  return (
    <AnimatedCard
      depth
      ambient="drift"
      ambientColor={`${status.color}1f`}
      index={1}
      className="h-full"
      contentClassName={size === 'sm' ? 'justify-center gap-2' : 'justify-between gap-3'}
    >
      <div className="flex items-center gap-2">
        <div className={size === 'sm' ? 'flex h-11 w-11 items-center justify-center rounded-full' : 'flex h-12 w-12 items-center justify-center rounded-[16px]'} style={{ background: TONE_BG[status.tone] ?? TONE_BG.ok, color: status.color }}>
          <Icon size={size === 'sm' ? 22 : 25} />
        </div>
        <LiveDot color={status.color} />
      </div>
      <div>
        <p className={size === 'lg' || size === 'wide' ? 'text-xl font-semibold leading-tight text-black/90' : 'text-sm font-semibold leading-tight text-black/90'}>{status.label}</p>
        {size !== 'sm' && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-black/45">{status.detail ?? 'Sicurezza e dispositivi sotto controllo'}</p>}
      </div>
    </AnimatedCard>
  )
}
