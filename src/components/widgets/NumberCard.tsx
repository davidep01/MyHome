import { SlidersHorizontal } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DragSlider } from '../glass/DragSlider'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

interface Props { entityId: string; label: string; className?: string }

/** number / input_number → slider over [min,max] with the entity's own unit. */
export function NumberCard({ entityId, label, className }: Props) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const domain = entityId.split('.')[0] // 'number' | 'input_number'
  const value = Number(entity?.state)
  const hasValue = Number.isFinite(value)
  const min = Number(entity?.attributes?.min ?? entity?.attributes?.initial ?? 0)
  const max = Number(entity?.attributes?.max ?? 100)
  const unit = (entity?.attributes?.unit_of_measurement as string | undefined) ?? ''
  const unavailable = !entity || entity.state === 'unavailable'

  const pct = hasValue && max > min ? ((value - min) / (max - min)) * 100 : 0
  const fromPct = (p: number) => {
    const raw = min + (p / 100) * (max - min)
    const step = Number(entity?.attributes?.step ?? 1)
    return Math.round(raw / step) * step
  }

  const preview = (p: number) => setOptimisticState(entityId, String(fromPct(p)))
  const commit = (p: number) => {
    const v = fromPct(p)
    setOptimisticState(entityId, String(v))
    call(domain, 'set_value', { entity_id: entityId, value: v })
  }

  return (
    <GlassCard className={cn('flex flex-col gap-3', unavailable && 'opacity-55', className)}>
      <div className="flex items-start justify-between">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}>
          <SlidersHorizontal size={18} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-[#1d1d1f]">{hasValue ? value : '--'}{unit}</span>
      </div>
      <div className="mt-auto">
        <p className="mb-2 text-sm font-semibold leading-tight text-black/90">{label}</p>
        {!unavailable && <DragSlider value={Math.round(pct)} onChange={preview} onChangeEnd={commit} variant="blue" />}
      </div>
    </GlassCard>
  )
}
