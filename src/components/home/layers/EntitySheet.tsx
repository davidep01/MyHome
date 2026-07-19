import { useState, type CSSProperties } from 'react'
import { GlassSheet } from '../../glass/GlassSheet'
import { EntityCard } from '../../widgets/WidgetGrid'
import { WidgetErrorBoundary } from '../widgets/WidgetErrorBoundary'
import { useEntityStore } from '../../../store/entities'
import { makeRoomEntity } from './makeRoomEntity'
import type { DeviceOverride } from '../../../api/backend'
import type { RoomTarget } from './RoomsRow'
import { getWidgetSizeConfig, resolveEnabledCardSize } from '../../widgets/utils/getWidgetSizeConfig'

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
      <div className="grid w-full grid-flow-row-dense auto-rows-[38px] grid-cols-1 gap-3.5 sm:grid-cols-3">
        {visible.map((entityId, index) => {
          const size = resolveEnabledCardSize('M', overrides?.[entityId])
          const rows = getWidgetSizeConfig(size).rows
          const span = size === 'L' ? 'sm:col-span-3'
            : size === 'XL' ? 'sm:col-span-3'
              : size === 'M' ? 'sm:col-span-2'
                : 'sm:col-span-1'
          return (
            <div
              key={entityId}
              className={`card-enter h-full min-h-0 min-w-0 overflow-hidden [&_[data-widget-card]]:!min-h-0 ${span}`}
              style={{
                '--enter-i': Math.min(index, 10),
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
