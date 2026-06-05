import { useState } from 'react'
import { GlassCard } from '../glass/GlassCard'
import { DragSlider } from '../glass/DragSlider'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { cn } from '../../lib/utils'

function BlindsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="3" y1="13" x2="21" y2="13" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

interface CoverCardProps {
  entityId: string
  label: string
  className?: string
}

export function CoverCard({ entityId, label, className }: CoverCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)

  const position = (entity?.attributes?.current_position as number | undefined) ?? 0
  const unavailable = !entity || entity.state === 'unavailable'

  // Local preview during the drag so the slider is smooth at 60fps; the HA call
  // fires only once on release to avoid flooding the WebSocket.
  const [preview, setPreview] = useState<number | null>(null)
  const display = preview ?? position

  const commit = (v: number) => {
    light()
    const newPos = Math.round(v)
    setPreview(null)
    setOptimisticState(entityId, newPos > 0 ? 'open' : 'closed', { current_position: newPos })
    call('cover', 'set_cover_position', { entity_id: entityId, position: newPos })
  }

  return (
    <GlassCard className={cn('flex flex-col gap-3', unavailable && 'opacity-55', className)}>
      {/* Header: circle icon + position badge */}
      <div className="flex items-start justify-between">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--ink-secondary)' }}>
          <BlindsIcon />
        </div>
        {!unavailable && (
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>{display}%</span>
        )}
      </div>

      <div className="mt-auto">
        <p className="text-sm font-semibold leading-tight text-black/90 mb-3">{label}</p>
        <p className="text-xs mb-3" style={{ color: 'var(--ink-secondary)' }}>
          {unavailable ? 'Non disponibile' : display > 0 ? `Aperta ${display}%` : 'Chiusa'}
        </p>
        {!unavailable && (
          <DragSlider
            value={display}
            onChange={(v) => setPreview(Math.round(v))}
            onChangeEnd={commit}
            variant="blue"
          />
        )}
      </div>
    </GlassCard>
  )
}
