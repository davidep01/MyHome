import { useHomeStatus } from '../../../hooks/useHomeStatus'
import { useUIStore } from '../../../store/ui'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'

const TONE_BG: Record<string, string> = {
  ok: 'rgba(21,128,61,0.12)',
  warning: 'rgba(194,65,12,0.14)',
  critical: 'rgba(220,38,38,0.14)',
}

export function StatusWidget() {
  const status = useHomeStatus()
  const setActiveView = useUIStore((s) => s.setActiveView)
  const Icon = status.Icon

  return (
    <AnimatedCard
      depth
      ambient="drift"
      ambientColor={`${status.color}1f`}
      index={1}
      interactive
      onClick={() => setActiveView('security')}
      contentClassName="justify-center gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: TONE_BG[status.tone] ?? TONE_BG.ok, color: status.color }}>
          <Icon size={22} />
        </div>
        <LiveDot color={status.color} />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight text-black/90">{status.label}</p>
        <p className="mt-0.5 truncate text-xs text-black/45">{status.detail ?? 'Sicurezza'}</p>
      </div>
    </AnimatedCard>
  )
}
