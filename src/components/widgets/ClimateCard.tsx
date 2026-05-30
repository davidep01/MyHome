import { Thermometer, ChevronUp, ChevronDown } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
import { useUIStore } from '../../store/ui'
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

  const isOn = entity?.state !== 'off' && entity?.state !== 'unavailable'
  const currentTemp = entity?.attributes?.current_temperature as number | undefined
  const targetTemp = entity?.attributes?.temperature as number | undefined
  const hvacAction = entity?.attributes?.hvac_action as string | undefined
  const unavailable = !entity || entity.state === 'unavailable'

  const adjust = (delta: number) => {
    if (!targetTemp) return
    light()
    call('climate', 'set_temperature', {
      entity_id: entityId,
      temperature: targetTemp + delta,
    })
  }

  const modeColor =
    hvacAction === 'heating' ? tokens.accent.orange :
    hvacAction === 'cooling' ? tokens.accent.blue :
    tokens.text.tertiary

  return (
    <GlassCard
      interactive
      onClick={() => setSelectedEntity(entityId)}
      glow={isOn ? (hvacAction === 'heating' ? tokens.accent.orangeGlow : tokens.accent.blueGlow) : undefined}
      className={cn('flex flex-col gap-3 min-h-[140px]', isOn && hvacAction === 'heating' && 'bg-[rgba(249,115,22,0.16)]', className)}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-[14px]',
          isOn ? 'bg-orange-500/15' : 'bg-white/8',
        )}>
          <Thermometer
            size={20}
            style={{ color: isOn ? modeColor : undefined }}
            className={cn(!isOn && 'text-white/30')}
          />
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/8 capitalize"
          style={{ color: modeColor }}>
          {hvacAction ?? entity?.state ?? '—'}
        </span>
      </div>

      <div className="flex items-end justify-between mt-auto">
        <div>
          <p className="text-sm font-medium text-white/90">{label}</p>
          {currentTemp !== undefined && (
            <p className="text-xs mt-0.5" style={{ color: tokens.text.tertiary }}>
              Attuale {currentTemp}°
            </p>
          )}
        </div>

        {targetTemp !== undefined && !unavailable && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); adjust(-0.5) }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 transition-colors active:scale-90"
            >
              <ChevronDown size={16} className="text-white/70" />
            </button>
            <span className="text-lg font-semibold text-white w-12 text-center">
              {targetTemp}°
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); adjust(0.5) }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/8 hover:bg-white/14 transition-colors active:scale-90"
            >
              <ChevronUp size={16} className="text-white/70" />
            </button>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
