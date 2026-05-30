import { useMemo } from 'react'
import { useRooms } from '../hooks/useRooms'
import { HomeHeader } from '../components/home/HomeHeader'
import { PeopleCard } from '../components/home/PeopleCard'
import { SectionBand } from '../components/home/SectionBand'
import { SceneRow } from '../components/layout/SceneRow'
import { WidgetGrid } from '../components/widgets/WidgetGrid'
import type { Room, RoomEntity } from '../api/backend'

export function TabletDashboard() {
  const { data, isLoading, isError } = useRooms()

  const groups = useMemo(() => {
    const rooms: Room[] = data ?? []
    const all = rooms.flatMap((r) => r.entities)
    const cameras = all.filter((e) => e.type === 'camera')
    const locks = all.filter((e) => e.type === 'lock')
    const favorites = all.filter((e) => e.favorite)
    // Room sections exclude cameras/locks (own sections) and favorites (Preferiti).
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

  if (isError) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
        <HomeHeader />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-red-300/80">Backend non raggiungibile</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto pr-1">
      <HomeHeader />
      <SceneRow />

      <SectionBand title="Persone" minColumn={260}>
        <PeopleCard />
      </SectionBand>

      {isLoading && <p className="px-1 text-sm text-white/40">Caricamento…</p>}

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
    </div>
  )
}
