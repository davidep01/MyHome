import { Flame, Snowflake, ChevronUp, ChevronDown } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useUIStore } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

interface ClimateCardProps {
  entityId: string
  label: string
  className?: string
}

export function ClimateCard({ entityId, label, className }: ClimateCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const isOn = entity?.state !== 'off' && entity?.state !== 'unavailable'
  const currentTemp = entity?.attributes?.current_temperature as number | undefined
  const targetTemp = entity?.attributes?.temperature as number | undefined
  const hvacAction = entity?.attributes?.hvac_action as string | undefined
  const unavailable = !entity || entity.state === 'unavailable'

  const heating = hvacAction === 'heating' || entity?.state === 'heat'
  const cooling = hvacAction === 'cooling' || entity?.state === 'cool'

  // Exact colors from comp-tiles.html
  const accent = heating ? '#dc2626' : cooling ? '#0066cc' : 'rgba(29,29,31,0.45)'
  const icoTint = heating ? 'rgba(220,38,38,0.14)' : cooling ? 'rgba(0,102,204,0.10)' : 'rgba(0,0,0,0.05)'
  const cardBg = heating ? 'rgba(220,38,38,0.12)' : cooling ? 'rgba(0,102,204,0.10)' : undefined
  const cardBorder = heating ? 'rgba(220,38,38,0.22)' : cooling ? 'rgba(0,102,204,0.22)' : undefined
  const glow = heating ? 'rgba(220,38,38,0.32)' : cooling ? 'rgba(0,102,204,0.28)' : undefined

  const adjust = (delta: number) => {
    if (targetTemp === undefined || !entity) return
    light()
    const next = Number((targetTemp + delta).toFixed(1))
    setOptimisticState(entityId, entity.state, { temperature: next })
    call('climate', 'set_temperature', { entity_id: entityId, temperature: next })
  }

  const Icon = cooling ? Snowflake : Flame

  return (
    <GlassCard
      interactive
      onClick={() => setSelectedEntity(entityId)}
      glow={isOn ? glow : undefined}
      className={cn('flex flex-col gap-2 min-h-[140px]', unavailable && 'opacity-55', className)}
      style={cardBg ? { background: cardBg, borderColor: cardBorder } : undefined}
    >
      {/* Header: circle icon + mode label */}
      <div className="flex items-start justify-between">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: icoTint, color: accent }}>
          <Icon size={20} />
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', color: accent }}>
          {hvacAction ?? entity?.state ?? '—'}
        </span>
      </div>

      {/* Name */}
      <p className="text-sm font-semibold leading-tight text-black/90">{label}</p>

      {/* Large target temperature — 26px/300 weight in state color */}
      {targetTemp !== undefined && (
        <div style={{ fontSize: 26, fontWeight: 300, color: isOn ? accent : 'rgba(29,29,31,0.45)', letterSpacing: '-1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {targetTemp.toFixed(1)}°
        </div>
      )}

      {/* Current temp below */}
      {currentTemp !== undefined && (
        <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Attuale {currentTemp.toFixed(1)}°</p>
      )}

      {/* +/− controls */}
      {targetTemp !== undefined && !unavailable && (
        <div className="flex items-center gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => adjust(-0.5)} className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <ChevronDown size={16} style={{ color: 'var(--ink)' }} />
          </button>
          <button onClick={() => adjust(0.5)} className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90" style={{ background: 'rgba(0,0,0,0.06)' }}>
            <ChevronUp size={16} style={{ color: 'var(--ink)' }} />
          </button>
        </div>
      )}
    </GlassCard>
  )
}
