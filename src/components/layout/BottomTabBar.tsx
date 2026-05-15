import { motion, AnimatePresence } from 'framer-motion'
import { Home, Settings } from 'lucide-react'
import { useUIStore } from '../../store/ui'
import { useRooms } from '../../hooks/useRooms'
import { framerSpringBounce } from '../../design/tokens'
import { cn } from '../../lib/utils'
import { withAllRoom } from '../../lib/rooms'

// Inline SVG icons matching Sidebar (same set)
const RoomIcon = ({ icon, size = 20 }: { icon: string; size?: number }) => {
  switch (icon) {
    case 'sofa':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
          <path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z" />
        </svg>
      )
    case 'utensils':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      )
    case 'bed':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 4v16" />
          <path d="M2 8h18a2 2 0 0 1 2 2v10" />
          <path d="M2 17h20" />
          <path d="M6 8v9" />
        </svg>
      )
    case 'bath':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
          <line x1="3" x2="21" y1="11" y2="11" />
        </svg>
      )
    case 'tree-pine':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14l-.7-1.4A2 2 0 0 1 7.22 10h.01l-1-2.9A1 1 0 0 1 7.2 6h.02L12 3l4.78 3a1 1 0 0 1 .01 1.1l-1 2.9h.01a2 2 0 0 1 .97 2.6Z" />
          <path d="M12 22v-3" />
        </svg>
      )
    default:
      return <Home size={size} />
  }
}

// Keep one slot for Settings in the mobile bar.
const MAX_ROOM_TABS = 4

export function BottomTabBar() {
  const activeRoom = useUIStore((s) => s.activeRoom)
  const setActiveRoom = useUIStore((s) => s.setActiveRoom)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const { data } = useRooms()

  const visibleRooms = withAllRoom(data).slice(0, MAX_ROOM_TABS)

  return (
    <nav
      className="glass glass-border fixed bottom-0 inset-x-0 z-30 flex items-center justify-around px-2 md:hidden"
      style={{
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop: '8px',
        borderRadius: '20px 20px 0 0',
      }}
    >
      {visibleRooms.map((room) => {
        const isActive = activeView === 'dashboard' && activeRoom === room.id
        return (
          <motion.button
            key={room.id}
            onClick={() => {
              setActiveView('dashboard')
              setActiveRoom(room.id)
            }}
            whileTap={{ scale: 0.88 }}
            transition={framerSpringBounce}
            // 44×44px minimum touch target via padding
            className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 rounded-[14px]"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {/* Active pill background */}
            <AnimatePresence>
              {isActive && (
                <motion.span
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-[14px] bg-white/12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={framerSpringBounce}
                />
              )}
            </AnimatePresence>

            <span className={cn('relative transition-colors duration-200', isActive ? 'text-white' : 'text-white/35')}>
              <RoomIcon icon={room.icon} size={22} />
            </span>
            <span
              className={cn(
                'relative text-[10px] font-medium leading-none transition-colors duration-200',
                isActive ? 'text-white' : 'text-white/35',
              )}
            >
              {room.label}
            </span>
          </motion.button>
        )
      })}
      <motion.button
        onClick={() => setActiveView('settings')}
        whileTap={{ scale: 0.88 }}
        transition={framerSpringBounce}
        className="relative flex flex-col items-center justify-center gap-1 min-w-[44px] min-h-[44px] px-3 py-2 rounded-[14px]"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <AnimatePresence>
          {activeView === 'settings' && (
            <motion.span
              layoutId="tab-bg"
              className="absolute inset-0 rounded-[14px] bg-white/12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={framerSpringBounce}
            />
          )}
        </AnimatePresence>
        <Settings
          size={22}
          className={cn('relative transition-colors duration-200', activeView === 'settings' ? 'text-white' : 'text-white/35')}
        />
        <span
          className={cn(
            'relative text-[10px] font-medium leading-none transition-colors duration-200',
            activeView === 'settings' ? 'text-white' : 'text-white/35',
          )}
        >
          Setup
        </span>
      </motion.button>
    </nav>
  )
}
