import { Lightbulb, ChevronRight } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { DragSlider } from '../glass/DragSlider'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import { cn } from '../../lib/utils'

interface LightCardProps {
  entityId: string
  label: string
  className?: string
}

export function LightCard({ entityId, label, className }: LightCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light: hapticLight } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)

  const isOn = entity?.state === 'on'
  const brightness = entity?.attributes?.brightness
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : isOn ? 100 : 0
  const unavailable = !entity || entity.state === 'unavailable'

  const toggle = () => {
    if (unavailable) return
    hapticLight()
    const previousState = entity.state
    setOptimisticState(entityId, isOn ? 'off' : 'on')
    call('light', isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }).catch(() => {
      setOptimisticState(entityId, previousState)
    })
  }

  const setBrightness = (val: number) => {
    patchEntity(entityId, { attributes: { brightness: Math.round((val / 100) * 255) } })
  }
  const commitBrightness = (val: number) => {
    setOptimisticState(entityId, 'on', { brightness: Math.round((val / 100) * 255) })
    call('light', 'turn_on', { entity_id: entityId, brightness_pct: val })
  }

  return (
    <GlassCard
      glow={isOn ? 'rgba(234,179,8,0.30)' : undefined}
      className={cn(
        'flex flex-col gap-3 min-h-[120px]',
        isOn && 'bg-[rgba(234,179,8,0.10)]',
        isOn && '[border-color:rgba(234,179,8,0.30)]',
        unavailable && 'opacity-55',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        {/* Icon — circle (999px), matches design system .tico spec */}
        <button
          type="button"
          onClick={toggle}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-300"
          style={isOn ? { background: 'rgba(234,179,8,0.18)', color: '#b8860b' } : { background: 'rgba(0,0,0,0.05)', color: 'rgba(29,29,31,0.45)' }}
          aria-label={`Accendi/spegni ${label}`}
        >
          <Lightbulb size={20} />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/8 text-black/35 transition hover:text-black/70"
          onClick={() => setSelectedEntity(entityId)}
          aria-label={`Apri controlli ${label}`}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium leading-tight text-black/90">{label}</p>
        <p className="mt-0.5 text-xs" style={{ color: tokens.text.tertiary }}>
          {unavailable ? 'Non disponibile' : isOn ? `Accesa • ${brightness}%` : 'Spenta'}
        </p>
      </div>

      {isOn && !unavailable && (
        <DragSlider value={brightness} onChange={setBrightness} onChangeEnd={commitBrightness} variant="amber" />
      )}
    </GlassCard>
  )
}
