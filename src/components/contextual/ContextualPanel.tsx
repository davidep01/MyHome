import { X, Flame, Lightbulb, ShieldCheck, Cpu, Tv } from 'lucide-react'
import { ClimateDetail } from './ClimateDetail'
import { GenericDetail } from './GenericDetail'
import { LightDetail } from './LightDetail'
import { AlarmDetail } from './AlarmDetail'
import { MediaDetail } from './MediaDetail'
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
  const domain = entityId.split('.')[0]
  const meta = domainMeta[domain] ?? { Icon: Cpu, color: tokens.accent.blue }
  const Icon = meta.Icon
  const name = entityName(entity)

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${meta.color}22` }}>
          <Icon size={18} style={{ color: meta.color }} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-black/90">{name}</h2>
          <p className="truncate text-xs text-black/40">
            {!entity ? 'Non disponibile' : stateLabel(entity.state)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedEntity(null)}
          className="tap-target flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-black/60 transition hover:text-[#1d1d1f] active:scale-95"
          aria-label="Chiudi"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Body — lo scroll è dello sheet, qui niente overflow */}
      <div>
        {!entity ? (
          <p className="py-12 text-center text-sm text-black/40">Entità non disponibile</p>
        ) : domain === 'climate' ? (
          <ClimateDetail entity={entity} />
        ) : domain === 'light' ? (
          <LightDetail entity={entity} />
        ) : domain === 'alarm_control_panel' ? (
          <AlarmDetail entity={entity} />
        ) : domain === 'media_player' ? (
          <MediaDetail entity={entity} />
        ) : (
          <GenericDetail entity={entity} />
        )}
      </div>
    </div>
  )
}
