import { Fan } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DragSlider } from '../glass/DragSlider'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

/** fan → on/off + percentage speed slider. */
export function FanCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const on = entity?.state === 'on'
  const pct = Number(entity?.attributes?.percentage ?? (on ? 100 : 0))
  const unavailable = !entity || entity.state === 'unavailable'

  const toggle = () => {
    if (unavailable) return
    light()
    setOptimisticState(entityId, on ? 'off' : 'on')
    call('fan', on ? 'turn_off' : 'turn_on', { entity_id: entityId })
  }
  const preview = (v: number) => setOptimisticState(entityId, v > 0 ? 'on' : 'off', { percentage: v })
  const commit = (v: number) => {
    setOptimisticState(entityId, v > 0 ? 'on' : 'off', { percentage: v })
    call('fan', 'set_percentage', { entity_id: entityId, percentage: v })
  }

  return (
    <GlassCard
      glow={on ? 'rgba(0,102,204,0.20)' : undefined}
      className={cn('flex flex-col gap-3', unavailable && 'opacity-55', className)}
    >
      <div className="flex items-start justify-between">
        <button
          type="button"
          onClick={toggle}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full"
          style={on ? { background: 'rgba(0,102,204,0.14)', color: 'var(--action-blue)' } : { background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}
          aria-label={`Accendi/spegni ${label}`}
        >
          <Fan size={20} className={on ? 'animate-spin [animation-duration:3s]' : ''} />
        </button>
        <div className={cn('lg-toggle', on && 'on')} onClick={toggle} style={on ? { background: 'var(--action-blue)' } : undefined}>
          <span className="lg-toggle-knob" />
        </div>
      </div>
      <div className="mt-auto">
        <p className="text-sm font-semibold leading-tight text-black/90">{label}</p>
        <p className="mb-2 mt-0.5 text-xs" style={{ color: 'var(--ink-tertiary)' }}>
          {unavailable ? 'Non disponibile' : on ? `Acceso · ${Math.round(pct)}%` : 'Spento'}
        </p>
        {on && !unavailable && <DragSlider value={Math.round(pct)} onChange={preview} onChangeEnd={commit} variant="blue" />}
      </div>
    </GlassCard>
  )
}
