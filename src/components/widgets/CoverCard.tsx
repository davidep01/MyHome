import { ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { framerSpringBounce, tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface CoverCardProps {
  entityId: string
  label: string
  className?: string
}

export function CoverCard({ entityId, label, className }: CoverCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()

  const position = entity?.attributes?.current_position as number | undefined
  const isOpen = entity?.state === 'open'
  const unavailable = !entity || entity.state === 'unavailable'

  const open = () => { light(); call('cover', 'open_cover', { entity_id: entityId }) }
  const close = () => { light(); call('cover', 'close_cover', { entity_id: entityId }) }
  const stop = () => { light(); call('cover', 'stop_cover', { entity_id: entityId }) }

  return (
    <GlassCard className={cn('flex flex-col gap-3 min-h-[140px]', className)}>
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-black/8">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={isOpen ? tokens.accent.blue : 'rgba(0,0,0,0.18)'}
            strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="3" y1="13" x2="21" y2="13" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </div>
        {position !== undefined && (
          <span className="text-xs font-semibold text-black/60">{position}%</span>
        )}
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium text-black/90 mb-3">{label}</p>
        <div className="flex gap-2">
          {[
            { icon: ChevronUp, action: open, label: 'Su', disabled: position === 100 },
            { icon: Minus, action: stop, label: 'Stop', disabled: false },
            { icon: ChevronDown, action: close, label: 'Giù', disabled: position === 0 },
          ].map(({ icon: Icon, action, label: btnLabel, disabled }) => (
            <motion.button
              key={btnLabel}
              onClick={action}
              disabled={disabled || unavailable}
              whileTap={!disabled && !unavailable ? { scale: 0.91 } : undefined}
              transition={framerSpringBounce}
              // min 44px touch target height
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 rounded-[12px] min-h-[44px] py-2 text-xs font-medium transition-all',
                disabled || unavailable
                  ? 'bg-black/5 text-black/20 cursor-not-allowed'
                  : 'bg-black/10 text-black/70 hover:bg-black/16 hover:text-[#1d1d1f]',
              )}
            >
              <Icon size={14} />
              <span>{btnLabel}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
