import { useState, useEffect } from 'react'
import { useUIStore } from '../store/ui'
import { quickScenes } from '../config/rooms'
import { useRooms } from '../hooks/useRooms'
import type { RoomEntity } from '../api/backend'
import { LightCard } from '../components/widgets/LightCard'
import { ClimateCard } from '../components/widgets/ClimateCard'
import { CoverCard } from '../components/widgets/CoverCard'
import { SceneCard } from '../components/widgets/SceneCard'
import { MediaCard } from '../components/widgets/MediaCard'
import { SwitchCard } from '../components/widgets/SwitchCard'
import { CameraCard } from '../components/widgets/CameraCard'
import { SecurityCard } from '../components/widgets/SecurityCard'
import { GlassCard } from '../components/glass/GlassCard'
import { ContextualBar } from '../components/layout/ContextualBar'
import { NotificationBell } from '../components/notifications/NotificationCenter'
import { tokens } from '../design/tokens'
import { withAllRoom } from '../lib/rooms'

function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
      setDate(now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <div className="text-3xl font-light text-white/90 tabular-nums">{time}</div>
      <div className="text-xs capitalize mt-0.5" style={{ color: tokens.text.tertiary }}>{date}</div>
    </div>
  )
}

function UnsupportedEntityCard({ entity }: { entity: RoomEntity }) {
  return (
    <GlassCard className="flex flex-col justify-center gap-1 min-h-[110px]">
      <p className="text-sm font-medium text-white/85">{entity.label}</p>
      <p className="text-xs font-mono text-white/35 truncate">{entity.entityId}</p>
      <p className="text-xs text-white/25">{entity.type}</p>
    </GlassCard>
  )
}

function RoomWidgets({ entities }: { entities: RoomEntity[] }) {
  if (entities.length === 0) {
    return (
      <div className="col-span-full flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: tokens.text.tertiary }}>Nessuna entità configurata</p>
      </div>
    )
  }

  return (
    <>
      {entities.map((e) => {
        switch (e.type) {
          case 'light':
            return <LightCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'climate':
            return <ClimateCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'cover':
            return <CoverCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'scene':
            return <SceneCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'media':
            return <MediaCard key={e.id} entityId={e.entityId} label={e.label} className="col-span-2" />
          case 'switch':
            return <SwitchCard key={e.id} entityId={e.entityId} label={e.label} />
          case 'camera':
            return <CameraCard key={e.id} entityId={e.entityId} label={e.label} className="col-span-2" />
          case 'security':
            return <SecurityCard key={e.id} entityId={e.entityId} label={e.label} />
          default:
            return <UnsupportedEntityCard key={e.id} entity={e} />
        }
      })}
    </>
  )
}

export function TabletDashboard() {
  const activeRoom = useUIStore((s) => s.activeRoom)
  const setActiveRoom = useUIStore((s) => s.setActiveRoom)
  const { data, isLoading, isError } = useRooms()
  const rooms = withAllRoom(data)
  const room = rooms.find((r) => r.id === activeRoom) ?? rooms[0]

  useEffect(() => {
    if (data && !rooms.some((r) => r.id === activeRoom)) setActiveRoom('all')
  }, [activeRoom, data, rooms, setActiveRoom])

  return (
    <div className="flex flex-col h-full gap-3 overflow-y-auto">
      {/* Header */}
      <GlassCard className="flex items-center justify-between shrink-0 gap-4">
        <Clock />
        <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
          {quickScenes.map((s) => (
            <SceneCard
              key={s.entityId}
              entityId={s.entityId}
              label={s.label}
              icon={s.icon}
              // min-h-[44px] garantisce tap target HIG-compliant
              className="!min-h-[44px] !py-0 !px-3"
            />
          ))}
          <NotificationBell />
        </div>
      </GlassCard>

      {/* Contextual bar */}
      <div className="shrink-0">
        <ContextualBar />
      </div>

      {/* Room label */}
      <div className="flex items-center gap-2 px-1 shrink-0">
        <h2 className="text-lg font-semibold text-white/90">
          {isLoading ? 'Caricamento...' : room.label}
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/40">
          {room.entities.length} dispositivi
        </span>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {isError ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <p className="text-sm text-red-300/80">Backend non raggiungibile</p>
          </div>
        ) : (
          <RoomWidgets entities={room.entities} />
        )}
      </div>
    </div>
  )
}
