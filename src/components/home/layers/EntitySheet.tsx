import { useMemo, useState, type CSSProperties } from 'react'
import { Search } from 'lucide-react'
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
  return <EntitySheetContent key={target?.key ?? 'closed'} target={target} overrides={overrides} onClose={onClose} />
}

function EntitySheetContent({ target, overrides, onClose }: {
  target: RoomTarget | null
  overrides?: Record<string, DeviceOverride>
  onClose: () => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [availability, setAvailability] = useState('all')
  const ids = useMemo(() => [...new Set(target?.entityIds ?? [])], [target?.entityIds])
  const filtered = ids.filter(id => {
    const entity = entities[id]
    const available = Boolean(entity) && !['unavailable', 'unknown'].includes(entity.state)
    if (availability === 'available' && !available || availability === 'unavailable' && available) return false
    const label = overrides?.[id]?.label || entity?.attributes.friendly_name || id
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it')
    return normalize(`${label} ${id}`).includes(normalize(query.trim()))
  })
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_CAP)

  return (
    <GlassSheet
      open={Boolean(target)}
      onClose={() => { setShowAll(false); onClose() }}
      title={target?.title ?? ''}
      side="center"
      wide
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--fill-subtle)] px-3 text-[var(--ink-secondary)]">
          <Search size={18} aria-hidden="true" />
          <input type="search" aria-label="Cerca dispositivo" placeholder="Cerca dispositivo" value={query} onChange={e => { setQuery(e.target.value); setShowAll(false) }} className="min-h-11 min-w-0 flex-1 bg-transparent text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--action-blue)]" />
        </label>
        <select aria-label="Disponibilità dispositivi" value={availability} onChange={e => { setAvailability(e.target.value); setShowAll(false) }} className="min-h-11 rounded-xl bg-[var(--fill-subtle)] px-3 text-[var(--ink)]">
          <option value="all">Tutti</option><option value="available">Disponibili</option><option value="unavailable">Non disponibili</option>
        </select>
      </div>
      <p className="mb-3 text-sm text-[var(--ink-secondary)]" aria-live="polite">{filtered.length ? `${filtered.length} dispositivi` : 'Nessun dispositivo corrisponde alla ricerca'}</p>
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
      {!showAll && filtered.length > INITIAL_CAP && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto mt-4 flex min-h-[44px] items-center rounded-full bg-[var(--fill-subtle)] px-5 text-sm font-semibold text-[var(--ink-secondary)] transition active:scale-95"
        >
          Mostra tutte ({filtered.length})
        </button>
      )}
    </GlassSheet>
  )
}
