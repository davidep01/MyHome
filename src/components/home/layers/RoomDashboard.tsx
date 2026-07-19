import type { CSSProperties } from 'react'
import type { DeviceOverride } from '../../../api/backend'
import type { RoomOverview } from '../../../hooks/useRoomsOverview'
import { selectDashboardCameraIds, selectRoomDashboardIds } from '../../../lib/dashboardSelection'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { CameraMonitoringRow } from './CameraMonitoringRow'
import { makeRoomEntity } from './makeRoomEntity'

/** Dashboard kiosk di una stanza: stessa grammatica della Home, dati limitati all'area. */
export function RoomDashboard({
  room,
  overrides,
}: {
  room: RoomOverview
  overrides?: Record<string, DeviceOverride>
}) {
  const entities = useEntityStore((state) => state.entities)
  const cameraIds = selectDashboardCameraIds(entities, {
    allowedEntityIds: room.entityIds,
    overrides,
    limit: 3,
  })
  const deviceIds = selectRoomDashboardIds(room.entityIds, entities, overrides, 6)
  const hasCameras = cameraIds.length > 0

  return (
    <section className={hasCameras
      ? 'grid h-full min-h-0 grid-rows-[minmax(145px,1fr)_minmax(0,1fr)] gap-3.5 overflow-hidden'
      : 'h-full min-h-0 overflow-hidden'}
    >
      {hasCameras && <CameraMonitoringRow entityIds={cameraIds} overrides={overrides} fillEmpty={false} />}
      {deviceIds.length > 0 ? (
        <div className={`grid h-full min-h-0 grid-cols-3 gap-3.5 overflow-hidden ${deviceIds.length > 3 ? 'grid-rows-2' : 'grid-rows-1'}`}>
          {deviceIds.map((entityId, index) => (
            <div
              key={entityId}
              className="card-enter h-full min-w-0"
              style={{ '--enter-i': Math.min(index, 8) } as CSSProperties}
            >
              <WidgetErrorBoundary>
                <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size="M" />
              </WidgetErrorBoundary>
            </div>
          ))}
        </div>
      ) : !hasCameras ? (
        <div className="glass glass-border flex h-full items-center justify-center rounded-[18px] text-sm font-semibold text-black/38 dark:text-white/38">
          Nessun dispositivo disponibile in questa stanza
        </div>
      ) : null}
    </section>
  )
}

