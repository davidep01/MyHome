import { Siren } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

/** siren → on/off toggle. */
export function SirenCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { medium } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const on = entity?.state === 'on'
  const unavailable = !entity || entity.state === 'unavailable'

  const toggle = () => {
    if (unavailable) return
    medium()
    setOptimisticState(entityId, on ? 'off' : 'on')
    call('siren', on ? 'turn_off' : 'turn_on', { entity_id: entityId })
  }

  return (
    <GlassCard
      interactive={!unavailable}
      onClick={toggle}
      glow={on ? 'rgba(220,38,38,0.32)' : undefined}
      className={cn('flex flex-col gap-3', on && 'bg-[rgba(220,38,38,0.12)]', unavailable && 'opacity-55', className)}
    >
      <div className="flex items-start justify-between">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={on ? { background: 'rgba(220,38,38,0.18)', color: 'var(--danger-red)' } : { background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}>
          <Siren size={18} />
        </div>
        <div className={cn('lg-toggle', on && 'on')} style={on ? { background: 'var(--danger-red)' } : undefined}>
          <span className="lg-toggle-knob" />
        </div>
      </div>
      <div className="mt-auto">
        <p className="text-sm font-semibold leading-tight text-black/90">{label}</p>
        <p className="mt-0.5 text-xs" style={{ color: on ? 'var(--danger-red)' : 'var(--ink-tertiary)' }}>
          {unavailable ? 'Non disponibile' : on ? 'Attiva' : 'Spenta'}
        </p>
      </div>
    </GlassCard>
  )
}
