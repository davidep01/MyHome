import { useMemo } from 'react'
import { useAreaIndex } from '../../../hooks/useAreaIndex'
import { useHAHiddenEntities } from '../../../hooks/useHAHiddenEntities'
import { useEntityStore } from '../../../store/entities'
import { isRenderableDomain } from './makeRoomEntity'
import { cn } from '../../../lib/utils'
import type { DeviceOverride } from '../../../api/backend'

export interface RoomTarget {
  title: string
  entityIds: string[]
}

/** Ordine di presentazione dei domini dentro una stanza. */
const DOMAIN_ORDER = ['light', 'switch', 'input_boolean', 'fan', 'humidifier', 'climate', 'cover', 'valve', 'lock', 'media_player', 'camera', 'vacuum', 'lawn_mower', 'scene', 'script', 'sensor', 'binary_sensor']

function domainRank(entityId: string): number {
  const i = DOMAIN_ORDER.indexOf(entityId.split('.')[0])
  return i === -1 ? DOMAIN_ORDER.length : i
}

/**
 * Strato 3 — Stanze: l'inventario completo dietro un tap. Chip dalle aree HA
 * (fallback: una sola chip "Tutti i dispositivi" se il registry non risponde);
 * il conteggio nel badge è quello dei dispositivi attivi.
 */
export function RoomsRow({
  hiddenEntities,
  overrides,
  onOpen,
}: {
  hiddenEntities?: string[]
  overrides?: Record<string, DeviceOverride>
  onOpen: (room: RoomTarget) => void
}) {
  const entities = useEntityStore((s) => s.entities)
  const haHidden = useHAHiddenEntities()
  const { areas, areaIdOf, ready } = useAreaIndex()

  const rooms = useMemo(() => {
    const hidden = new Set([...(hiddenEntities ?? []), ...haHidden])
    const visible = Object.values(entities).filter((e) =>
      !hidden.has(e.entity_id)
      && isRenderableDomain(e.entity_id)
      && overrides?.[e.entity_id]?.enabled !== false
      && e.attributes?.entity_category !== 'diagnostic')

    const byArea = new Map<string, { ids: string[]; active: number }>()
    const orphan: string[] = []
    let orphanActive = 0

    for (const e of visible) {
      const active = e.state === 'on' || e.state === 'playing' || e.state === 'cleaning' || e.state === 'heat' || e.state === 'cool'
      const areaId = areaIdOf(e.entity_id)
      if (areaId) {
        const bucket = byArea.get(areaId) ?? { ids: [], active: 0 }
        bucket.ids.push(e.entity_id)
        if (active) bucket.active += 1
        byArea.set(areaId, bucket)
      } else {
        orphan.push(e.entity_id)
        if (active) orphanActive += 1
      }
    }

    const sortIds = (ids: string[]) => [...ids].sort((a, b) => domainRank(a) - domainRank(b) || a.localeCompare(b))

    const list = areas
      .filter((a) => byArea.has(a.area_id))
      .map((a) => ({
        key: a.area_id,
        title: a.name,
        entityIds: sortIds(byArea.get(a.area_id)!.ids),
        active: byArea.get(a.area_id)!.active,
      }))

    if (!ready || list.length === 0) {
      // Registry non disponibile o nessuna area: tutto in una chip.
      const all = sortIds(visible.map((e) => e.entity_id))
      return all.length ? [{ key: 'all', title: 'Tutti i dispositivi', entityIds: all, active: orphanActive + list.reduce((n, r) => n + r.active, 0) }] : []
    }
    if (orphan.length) {
      list.push({ key: 'other', title: 'Altro', entityIds: sortIds(orphan), active: orphanActive })
    }
    return list
  }, [entities, areas, areaIdOf, ready, hiddenEntities, haHidden, overrides])

  if (rooms.length === 0) return null

  return (
    <section className="shrink-0">
      <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-black/35">Stanze</p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {rooms.map((room) => (
          <button
            key={room.key}
            type="button"
            onClick={() => onOpen({ title: room.title, entityIds: room.entityIds })}
            className="flex min-h-[48px] shrink-0 items-center gap-2 rounded-full border border-black/8 bg-white/72 px-5 text-[15px] font-semibold text-[#1d1d1f] backdrop-blur-xl transition active:scale-95"
          >
            {room.title}
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              room.active > 0 ? 'bg-[#0066cc]/12 text-[#0066cc]' : 'bg-black/[0.06] text-black/40',
            )}
            >
              {room.active > 0 ? room.active : room.entityIds.length}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
