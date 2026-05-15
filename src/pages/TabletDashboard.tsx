import { useState, useEffect } from 'react'
import { useUIStore } from '../store/ui'
import { rooms, quickScenes } from '../config/rooms'
import { LightCard } from '../components/widgets/LightCard'
import { ClimateCard } from '../components/widgets/ClimateCard'
import { CoverCard } from '../components/widgets/CoverCard'
import { SceneCard } from '../components/widgets/SceneCard'
import { MediaCard } from '../components/widgets/MediaCard'
import { SwitchCard } from '../components/widgets/SwitchCard'
import { CameraCard } from '../components/widgets/CameraCard'
import { GlassCard } from '../components/glass/GlassCard'
import { ContextualBar } from '../components/layout/ContextualBar'
import { NotificationBell } from '../components/notifications/NotificationCenter'
import { tokens } from '../design/tokens'

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

function RoomWidgets({ roomId }: { roomId: string }) {
  const room = rooms.find((r) => r.id === roomId)
  if (!room || room.entities.length === 0) {
    return (
      <div className="col-span-full flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: tokens.text.tertiary }}>Nessuna entità configurata</p>
      </div>
    )
  }

  return (
    <>
      {room.entities.map((e) => {
        switch (e.type) {
          case 'light':
            return <LightCard key={e.entityId} entityId={e.entityId} label={e.label} />
          case 'climate':
            return <ClimateCard key={e.entityId} entityId={e.entityId} label={e.label} />
          case 'cover':
            return <CoverCard key={e.entityId} entityId={e.entityId} label={e.label} />
          case 'scene':
            return <SceneCard key={e.entityId} entityId={e.entityId} label={e.label} />
          case 'media':
            return <MediaCard key={e.entityId} entityId={e.entityId} label={e.label} className="col-span-2" />
          case 'switch':
            return <SwitchCard key={e.entityId} entityId={e.entityId} label={e.label} />
          case 'camera':
            return <CameraCard key={e.entityId} entityId={e.entityId} label={e.label} className="col-span-2" />
          default:
            return null
        }
      })}
    </>
  )
}

export function TabletDashboard() {
  const activeRoom = useUIStore((s) => s.activeRoom)
  const room = rooms.find((r) => r.id === activeRoom)

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
              className="!min-h-0 !py-1.5 !px-3"
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
          {room?.label ?? 'Tutti'}
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/40">
          {room?.entities.length ?? 0} dispositivi
        </span>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <RoomWidgets roomId={activeRoom} />
      </div>
    </div>
  )
}
