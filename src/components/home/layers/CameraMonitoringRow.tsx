import type { CSSProperties } from 'react'
import { Video } from 'lucide-react'
import type { DeviceOverride } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'

const CAMERA_SLOTS = 3

/** Prima fila invariabile della Home: tre slot video, mai mescolati al composer. */
export function CameraMonitoringRow({
  entityIds,
  overrides,
  fillEmpty = true,
  compact = false,
}: {
  entityIds: string[]
  overrides?: Record<string, DeviceOverride>
  fillEmpty?: boolean
  /** Variante ribassata usata dalla fila globale; le camere di stanza restano ampie. */
  compact?: boolean
}) {
  const entities = useEntityStore((state) => state.entities)
  const slots = fillEmpty
    ? Array.from({ length: CAMERA_SLOTS }, (_, index) => entityIds[index] ?? null)
    : entityIds.slice(0, CAMERA_SLOTS)

  return (
    <section
      className={`camera-monitoring-row grid h-full min-h-0 grid-cols-3 overflow-hidden ${compact ? 'camera-monitoring-row--compact gap-2.5' : 'gap-3.5'}`}
      aria-label="Monitoraggio video"
    >
      {slots.map((entityId, index) => entityId ? (
        <div
          key={entityId}
          className="card-enter h-full min-w-0"
          style={{ '--enter-i': index } as CSSProperties}
        >
          <WidgetErrorBoundary>
            <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size={compact ? 'S' : 'M'} />
          </WidgetErrorBoundary>
        </div>
      ) : (
        <div
          key={`empty-camera-${index}`}
          className="glass glass-border flex h-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-[18px] text-black/28 dark:text-white/28"
        >
          <Video size={24} aria-hidden="true" />
          <span className="text-xs font-semibold">Camera non configurata</span>
        </div>
      ))}
    </section>
  )
}
