import { useMemo } from 'react'
import { useRooms } from '../hooks/useRooms'
import { useDiscoveredEntities } from '../hooks/useDiscoveredEntities'
import { useUIStore } from '../store/ui'
import { useEntityStore } from '../store/entities'
import { HomeHeader } from '../components/home/HomeHeader'
import { PeopleCard } from '../components/home/PeopleCard'
import { SectionBand } from '../components/home/SectionBand'
import { SceneRow } from '../components/layout/SceneRow'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import { cn } from '../lib/utils'
import type { Room, RoomEntity } from '../api/backend'

function SourceToggle() {
  const source = useUIStore((s) => s.dashboardSource)
  const setSource = useUIStore((s) => s.setDashboardSource)
  const options = [
    { id: 'auto' as const, label: 'Auto (HA live)' },
    { id: 'demo' as const, label: 'Layout demo' },
  ]
  return (
    <div className="flex gap-1 rounded-full bg-black/5 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setSource(o.id)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition',
            source === o.id ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-black/45 hover:text-black/70',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Auto-configuring home: sections built live from the HA entity stream. */
function AutoHome() {
  const { sections, total } = useDiscoveredEntities()
  const status = useEntityStore((s) => s.connectionStatus)

  if (total === 0) {
    return (
      <p className="px-1 text-sm text-black/40">
        {status === 'connected'
          ? 'Nessuna entità controllabile esposta da Home Assistant.'
          : status === 'connecting'
            ? 'Connessione a Home Assistant…'
            : 'In attesa di Home Assistant — verifica la connessione.'}
      </p>
    )
  }

  return (
    <>
      {sections.map((s) => (
        <SectionBand key={s.domain} title={s.label} count={s.entities.length} minColumn={s.minColumn}>
          <WidgetGrid entities={s.entities} />
        </SectionBand>
      ))}
    </>
  )
}

/** Curated layout that mirrors the reference screenshot, sourced from db.json. */
function DemoHome() {
  const { data, isLoading } = useRooms()

  const groups = useMemo(() => {
    const rooms: Room[] = data ?? []
    const all = rooms.flatMap((r) => r.entities)
    const cameras = all.filter((e) => e.type === 'camera')
    const locks = all.filter((e) => e.type === 'lock')
    const favorites = all.filter((e) => e.favorite)
    const roomSections = rooms
      .map((room) => ({
        room,
        entities: room.entities.filter(
          (e: RoomEntity) => e.type !== 'camera' && e.type !== 'lock' && !e.favorite,
        ),
      }))
      .filter((s) => s.entities.length > 0)
    return { cameras, locks, favorites, roomSections }
  }, [data])

  return (
    <>
      {isLoading && <p className="px-1 text-sm text-black/40">Caricamento…</p>}
      {groups.roomSections.map(({ room, entities }) => (
        <SectionBand key={room.id} title={room.label} count={entities.length}>
          <WidgetGrid entities={entities} />
        </SectionBand>
      ))}
      {groups.cameras.length > 0 && (
        <SectionBand title="Videocamere" count={groups.cameras.length} minColumn={240}>
          <WidgetGrid entities={groups.cameras} />
        </SectionBand>
      )}
      {groups.locks.length > 0 && (
        <SectionBand title="Serrature" count={groups.locks.length} minColumn={160}>
          <WidgetGrid entities={groups.locks} />
        </SectionBand>
      )}
      {groups.favorites.length > 0 && (
        <SectionBand title="Preferiti" count={groups.favorites.length}>
          <WidgetGrid entities={groups.favorites} />
        </SectionBand>
      )}
    </>
  )
}

export function TabletDashboard() {
  const source = useUIStore((s) => s.dashboardSource)
  const { isError } = useRooms()

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <HomeHeader />
      <SceneRow />

      <div className="flex items-center justify-between gap-2 px-1">
        <SectionBand title="Persone" minColumn={260}>
          <PeopleCard />
        </SectionBand>
      </div>

      <div className="flex justify-end px-1">
        <SourceToggle />
      </div>

      {source === 'auto' ? (
        <AutoHome />
      ) : isError ? (
        <p className="px-1 text-sm text-red-500/80">Backend non raggiungibile</p>
      ) : (
        <DemoHome />
      )}
    </div>
  )
}
