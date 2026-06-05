import { Power, Zap } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { domainAccent, tokens } from '../../design/tokens'
import { useEntityStore } from '../../store/entities'
import { DynamicIcon } from '../DynamicIcon'
import { cn } from '../../lib/utils'

interface SwitchCardProps {
  entityId: string
  label: string
  className?: string
  iconName?: string
}

export function SwitchCard({ entityId, label, className, iconName }: SwitchCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const accent = domainAccent('switch')

  const isOn = entity?.state === 'on'
  const unavailable = !entity || entity.state === 'unavailable'

  // Supports both switch.* and input_boolean.*
  const domain = entityId.split('.')[0] as 'switch' | 'input_boolean'

  const toggle = () => {
    if (unavailable) return
    light()
    const previousState = entity.state
    setOptimisticState(entityId, isOn ? 'off' : 'on')
    call(domain, isOn ? 'turn_off' : 'turn_on', { entity_id: entityId }).catch(() => {
      setOptimisticState(entityId, previousState)
    })
  }

  // Some smart plugs expose current_power_w or wattage attributes
  const power =
    (entity?.attributes?.current_power_w as number | undefined) ??
    (entity?.attributes?.wattage as number | undefined) ??
    (entity?.attributes?.power as number | undefined)

  return (
    <GlassCard
      interactive
      glow={isOn ? accent.glow : undefined}
      className={cn('flex flex-col gap-3 min-h-[110px]', className)}
      onClick={toggle}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300',
          isOn ? 'bg-green-500/20' : 'bg-black/8',
        )}>
          <DynamicIcon
            name={iconName}
            fallback={Power}
            size={18}
            className={cn(
              'transition-colors duration-300',
              isOn ? 'text-green-400' : 'text-black/30',
              unavailable && 'opacity-30',
            )}
          />
        </div>

        {/* Liquid Glass toggle pill */}
        <div
          className={cn('lg-toggle', isOn && 'on')}
          onClick={(e) => { e.stopPropagation(); toggle() }}
        >
          <span className="lg-toggle-knob" />
        </div>
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium text-black/90 leading-tight">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-xs" style={{ color: tokens.text.tertiary }}>
            {unavailable ? 'Non disponibile' : isOn ? 'Acceso' : 'Spento'}
          </p>
          {isOn && power !== undefined && (
            <div className="flex items-center gap-0.5 ml-1">
              <Zap size={9} className="text-yellow-400" />
              <span className="text-xs text-yellow-400 font-medium">{power}W</span>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
