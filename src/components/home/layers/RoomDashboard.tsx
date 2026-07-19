import type { CSSProperties } from 'react'
import type { DeviceOverride } from '../../../api/backend'
import type { RoomOverview } from '../../../hooks/useRoomsOverview'
import { selectDashboardCameraIds, selectRoomDashboardIds } from '../../../lib/dashboardSelection'
import { useEntityStore } from '../../../store/entities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { CameraMonitoringRow } from './CameraMonitoringRow'
import { makeRoomEntity } from './makeRoomEntity'
import { getWidgetSizeConfig, resolveEnabledCardSize } from '../../widgets/utils/getWidgetSizeConfig'

/** Dashboard kiosk di una stanza: stessa grammatica della Home, dati limitati all'area. */
export function RoomDashboard({
  room,
  overrides,
  cameraStreamsEnabled = false,
}: {
  room: RoomOverview
  overrides?: Record<string, DeviceOverride>
  /** Le camere Ring vengono montate soltanto dopo il comando esplicito in status bar. */
  cameraStreamsEnabled?: boolean
}) {
  const entities = useEntityStore((state) => state.entities)
  const cameraIds = selectDashboardCameraIds(entities, {
    allowedEntityIds: room.entityIds,
    overrides,
    limit: 3,
  })
  const deviceIds = selectRoomDashboardIds(room.entityIds, entities, overrides, 6)
  const hasCameras = cameraStreamsEnabled && cameraIds.length > 0

  return (
    <section className={hasCameras
      ? 'grid h-full min-h-0 grid-rows-[minmax(145px,1fr)_minmax(0,1fr)] gap-3.5 overflow-hidden'
      : 'h-full min-h-0 overflow-hidden'}
    >
      {hasCameras && <CameraMonitoringRow entityIds={cameraIds} overrides={overrides} fillEmpty={false} />}
      {deviceIds.length > 0 ? (
        <div className="grid h-full min-h-0 grid-flow-row-dense grid-cols-3 grid-rows-[repeat(6,minmax(0,1fr))] auto-rows-[minmax(0,1fr)] gap-3.5 overflow-hidden">
          {deviceIds.map((entityId, index) => {
            const size = resolveEnabledCardSize('M', overrides?.[entityId])
            const rows = getWidgetSizeConfig(size).rows
            const span = size === 'L' ? 'col-span-3'
              : size === 'XL' ? 'col-span-3'
                : size === 'M' ? 'col-span-2'
                  : 'col-span-1'
            return (
              <div
                key={entityId}
                className={`card-enter h-full min-h-0 min-w-0 overflow-hidden [&_[data-widget-card]]:!min-h-0 ${span}`}
                style={{
                  '--enter-i': Math.min(index, 8),
                  gridRow: `span ${rows} / span ${rows}`,
                } as CSSProperties}
              >
                <WidgetErrorBoundary>
                  <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size={size} />
                </WidgetErrorBoundary>
              </div>
            )
          })}
        </div>
      ) : !hasCameras ? (
        <div className="glass glass-border flex h-full items-center justify-center rounded-[18px] text-sm font-semibold text-black/38 dark:text-white/38">
          Nessun dispositivo disponibile in questa stanza
        </div>
      ) : null}
    </section>
  )
}
