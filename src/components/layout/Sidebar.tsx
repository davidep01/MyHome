import { motion } from 'framer-motion'
import { Home, Wifi, WifiOff, Lightbulb } from 'lucide-react'
import { rooms } from '../../config/rooms'
import { useUIStore } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { useHAConnected } from '../../hooks/useHAEntity'
import { cn } from '../../lib/utils'

const roomIcons: Record<string, React.ElementType> = {
  home: Home,
  sofa: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z" />
    </svg>
  ),
  utensils: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  ),
  bed: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" /><path d="M6 8v9" />
    </svg>
  ),
  bath: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <line x1="3" x2="21" y1="11" y2="11" />
    </svg>
  ),
  'tree-pine': () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14l-.7-1.4A2 2 0 0 1 7.22 10h.01l-1-2.9A1 1 0 0 1 7.2 6h.02L12 3l4.78 3a1 1 0 0 1 .01 1.1l-1 2.9h.01a2 2 0 0 1 .97 2.6Z" />
      <path d="M12 22v-3" />
    </svg>
  ),
}

export function Sidebar() {
  const activeRoom = useUIStore((s) => s.activeRoom)
  const setActiveRoom = useUIStore((s) => s.setActiveRoom)
  const connected = useHAConnected()
  const entities = useEntityStore((s) => s.entities)

  const lightsOn = Object.values(entities).filter(
    (e) => e.entity_id.startsWith('light.') && e.state === 'on',
  ).length

  return (
    <nav
      className="glass glass-border flex flex-col rounded-[24px] p-4 gap-2 h-full overflow-y-auto"
      style={{ minWidth: 200 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-blue-500/20">
          <Home size={16} className="text-blue-400" />
        </div>
        <span className="text-sm font-semibold text-white/90">MyHome</span>
        <div className="ml-auto">
          {connected
            ? <Wifi size={14} className="text-green-400" />
            : <WifiOff size={14} className="text-red-400" />
          }
        </div>
      </div>

      {/* Quick status */}
      <div className="rounded-[14px] bg-white/5 p-3 mb-2 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-white/60">
            <Lightbulb size={12} />
            <span>Luci accese</span>
          </div>
          <span className="font-semibold text-white/80">{lightsOn}</span>
        </div>
      </div>

      {/* Rooms */}
      <div className="space-y-1 flex-1">
        {rooms.map((room) => {
          const Icon = roomIcons[room.icon] ?? Home
          const isActive = activeRoom === room.id
          return (
            <motion.button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-white/12 text-white'
                  : 'text-white/50 hover:bg-white/6 hover:text-white/80',
              )}
              whileTap={{ scale: 0.97 }}
            >
              <Icon />
              <span>{room.label}</span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
