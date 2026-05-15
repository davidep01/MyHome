import { ChevronUp, ChevronDown, Minus } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { tokens } from '../../design/tokens'
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
    <GlassCard className={cn('flex flex-col gap-3 min-h-[120px]', className)}>
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/8">
          {/* Shutter icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={isOpen ? tokens.accent.blue : 'rgba(255,255,255,0.3)'}
            strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="3" y1="13" x2="21" y2="13" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </div>
        {position !== undefined && (
          <span className="text-xs font-semibold text-white/60">{position}%</span>
        )}
      </div>

      <div className="mt-auto">
        <p className="text-sm font-medium text-white/90 mb-2">{label}</p>
        <div className="flex gap-2">
          {[
            { icon: ChevronUp, action: open, label: 'Su', disabled: position === 100 },
            { icon: Minus, action: stop, label: 'Stop', disabled: false },
            { icon: ChevronDown, action: close, label: 'Giù', disabled: position === 0 },
          ].map(({ icon: Icon, action, label: btnLabel, disabled }) => (
            <button
              key={btnLabel}
              onClick={action}
              disabled={disabled || unavailable}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-[10px] py-1.5 text-xs font-medium transition-all',
                disabled || unavailable
                  ? 'bg-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-white/10 text-white/70 hover:bg-white/16 hover:text-white active:scale-95',
              )}
            >
              <Icon size={12} />
              {btnLabel}
            </button>
          ))}
        </div>
      </div>
    </GlassCard>
  )
}
