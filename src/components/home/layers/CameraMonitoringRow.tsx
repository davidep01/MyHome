import type { CSSProperties } from 'react'
import type { DeviceOverride } from '../../../api/backend'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { makeRoomEntity } from './makeRoomEntity'

const CAMERA_SLOTS = 3

/** Prima fila invariabile della Home: solo le camere scelte, mai un placeholder "non configurata". */
export function CameraMonitoringRow({
  entityIds,
  overrides,
  compact = false,
}: {
  entityIds: string[]
  overrides?: Record<string, DeviceOverride>
  /** Variante ribassata usata dalla fila globale; le camere di stanza restano ampie. */
  compact?: boolean
}) {
  const entities = useEntityStore((state) => state.entities)
  const slots = entityIds.slice(0, CAMERA_SLOTS)

  return (
    <section
      className={`camera-monitoring-row grid h-full min-h-0 grid-cols-3 overflow-hidden ${compact ? 'camera-monitoring-row--compact gap-2.5' : 'gap-3.5'}`}
      aria-label="Monitoraggio video"
    >
      {slots.map((entityId, index) => (
        <div
          key={entityId}
          className="card-enter h-full min-w-0"
          style={{ '--enter-i': index } as CSSProperties}
        >
          <WidgetErrorBoundary>
            <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size={compact ? 'S' : 'M'} />
          </WidgetErrorBoundary>
        </div>
      ))}
    </section>
  )
}
