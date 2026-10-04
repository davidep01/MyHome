import { X, Flame, Lightbulb, ShieldCheck, Cpu, Tv } from 'lucide-react'
import { useState } from 'react'
import { DetailLoader } from './DetailLoader'
import { DetailBoundary } from './DetailBoundary'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useUIStore } from '../../store/ui'
import { stateLabel } from '../widgets/utils/stateLabel'
import { entityName } from '../widgets/utils/mapEntityToWidgetCard'
import { tokens } from '../../design/tokens'

const domainMeta: Record<string, { Icon: React.ElementType; color: string }> = {
  climate: { Icon: Flame, color: tokens.accent.orange },
  light: { Icon: Lightbulb, color: tokens.accent.yellow },
  alarm_control_panel: { Icon: ShieldCheck, color: tokens.accent.red },
  media_player: { Icon: Tv, color: tokens.accent.green },
}

export function ContextualPanel({ entityId }: { entityId: string }) {
  const entity = useHAEntity(entityId)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const [attempt, setAttempt] = useState(0)
  const domain = entityId.split('.')[0]
  const meta = domainMeta[domain] ?? { Icon: Cpu, color: tokens.accent.blue }
  const Icon = meta.Icon
  const name = entityName(entity)
  const displayState = !entity
    ? 'Non disponibile'
    : domain === 'camera' && entity.state !== 'unavailable'
      ? 'Disponibile'
      : stateLabel(entity.state)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}>
          <Icon size={18} style={{ color: meta.color }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--ink)]">{name}</h2>
          <p className="truncate text-xs text-[var(--ink-secondary)]">
            {displayState}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedEntity(null)}
          className="tap-target flex h-9 w-9 items-center justify-center rounded-full bg-[var(--fill-subtle)] text-[var(--ink-secondary)] transition hover:text-[var(--ink)] active:scale-95"
          aria-label="Chiudi"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Body — lo scroll è dello sheet, qui niente overflow */}
      <div>
        {!entity ? (
          <p className="py-12 text-center text-sm text-[var(--ink-secondary)]">Entità non disponibile</p>
        ) : (
          <DetailBoundary key={`${entityId}:${attempt}`} onRetry={() => setAttempt(value => value + 1)}>
            <DetailLoader key={`${entityId}:${attempt}`} domain={domain} entity={entity} />
          </DetailBoundary>
        )}
      </div>
    </div>
  )
}
