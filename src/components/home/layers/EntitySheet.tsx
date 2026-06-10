import { useState, type CSSProperties } from 'react'
import { GlassSheet } from '../../glass/GlassSheet'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { useEntityStore } from '../../../store/entities'
import { makeRoomEntity } from './makeRoomEntity'
import type { DeviceOverride } from '../../../api/backend'
import type { RoomTarget } from './RoomsRow'

const INITIAL_CAP = 24

/**
 * Sheet con la griglia di card di una stanza (o di una chip-anomalia).
 * Cap a 24 card con "Mostra tutte" per le case dense — il render resta leggero.
 */
export function EntitySheet({
  target,
  overrides,
  onClose,
}: {
  target: RoomTarget | null
  overrides?: Record<string, DeviceOverride>
  onClose: () => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const [showAll, setShowAll] = useState(false)
  const ids = target?.entityIds ?? []
  const visible = showAll ? ids : ids.slice(0, INITIAL_CAP)

  return (
    <GlassSheet
      open={Boolean(target)}
      onClose={() => { setShowAll(false); onClose() }}
      title={target?.title ?? ''}
      side="center"
      wide
    >
      <div className="grid w-full grid-cols-2 gap-3 auto-rows-[150px] sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((entityId, index) => (
          <div key={entityId} className="card-enter h-full min-w-0" style={{ '--enter-i': Math.min(index, 10) } as CSSProperties}>
            <WidgetErrorBoundary>
              <EntityCard entity={makeRoomEntity(entityId, entities, overrides)} size="M" />
            </WidgetErrorBoundary>
          </div>
        ))}
      </div>
      {!showAll && ids.length > INITIAL_CAP && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto mt-4 flex min-h-[44px] items-center rounded-full bg-black/[0.06] px-5 text-sm font-semibold text-black/60 transition active:scale-95"
        >
          Mostra tutte ({ids.length})
        </button>
      )}
    </GlassSheet>
  )
}
