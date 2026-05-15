import { motion } from 'framer-motion'
import { Power, Zap } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface SwitchCardProps {
  entityId: string
  label: string
  className?: string
}

export function SwitchCard({ entityId, label, className }: SwitchCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()

  const isOn = entity?.state === 'on'
  const unavailable = !entity || entity.state === 'unavailable'

  // Supports both switch.* and input_boolean.*
  const domain = entityId.split('.')[0] as 'switch' | 'input_boolean'

  const toggle = () => {
    if (unavailable) return
    light()
    call(domain, isOn ? 'turn_off' : 'turn_on', { entity_id: entityId })
  }

  // Some smart plugs expose current_power_w or wattage attributes
  const power =
    (entity?.attributes?.current_power_w as number | undefined) ??
    (entity?.attributes?.wattage as number | undefined) ??
    (entity?.attributes?.power as number | undefined)

  return (
    <GlassCard
      interactive
      glow={isOn ? tokens.accent.greenGlow : undefined}
      className={cn('flex flex-col gap-3 min-h-[110px]', className)}
      onClick={toggle}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-[14px] transition-all duration-300',
          isOn ? 'bg-green-500/20' : 'bg-white/8',
        )}>
          <Power
            size={18}
            className={cn(
              'transition-colors duration-300',
              isOn ? 'text-green-400' : 'text-white/30',
              unavailable && 'opacity-30',
            )}
          />
        </div>

        <div
          className={cn(
            'h-5 w-9 rounded-full transition-all duration-300 relative',
            isOn ? 'bg-green-500' : 'bg-white/15',
          )}
          onClick={(e) => { e.stopPropagation(); toggle() }}
        >
          <motion.div
            className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm"
            animate={{ left: isOn ? '18px' : '2px' }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium text-white/90 leading-tight">{label}</p>
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
