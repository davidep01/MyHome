import { motion } from 'framer-motion'
import { Home, LayoutGrid, ThermometerSun, ShieldCheck, BarChart3, Pencil } from 'lucide-react'
import { useUIStore, type AppView } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { NotificationBell } from '../notifications/NotificationCenter'
import { cn } from '../../lib/utils'

const nav: { id: AppView; label: string; Icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', Icon: LayoutGrid },
  { id: 'climate', label: 'Clima', Icon: ThermometerSun },
  { id: 'security', label: 'Sicurezza', Icon: ShieldCheck },
  { id: 'energy', label: 'Energia', Icon: BarChart3 },
]

function RailButton({
  active,
  label,
  onClick,
  children,
  badge,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
  badge?: number
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      className={cn(
        'group relative flex h-11 w-11 items-center justify-center rounded-[16px] transition-colors',
        active ? 'bg-white/14 text-white' : 'text-white/40 hover:bg-white/8 hover:text-white/80',
      )}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-[16px] bg-white/14"
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-black/70 px-2 py-1 text-xs text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 z-50">
        {label}
      </span>
    </motion.button>
  )
}

export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const connected = connectionStatus === 'connected'

  return (
    <nav className="glass glass-border flex h-full w-[68px] flex-col items-center gap-2 rounded-[24px] py-4">
      {/* Avatar + connection dot */}
      <div className="relative mb-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 text-sm font-semibold text-white ring-1 ring-white/15">
          <Home size={18} className="text-white/90" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#0b0b14]',
            connected ? 'bg-green-400' : connectionStatus === 'connecting' ? 'bg-orange-400' : 'bg-red-400',
          )}
        />
      </div>

      <div className="my-1 h-px w-7 bg-white/10" />

      {nav.map(({ id, label, Icon }) => (
        <RailButton key={id} active={activeView === id} label={label} onClick={() => setActiveView(id)}>
          <Icon size={20} />
        </RailButton>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton label="Modifica" onClick={() => setActiveView('settings')} active={activeView === 'settings'}>
          <Pencil size={18} />
        </RailButton>
        <NotificationBell />
      </div>
    </nav>
  )
}
