import { motion } from 'framer-motion'
import { Home, LayoutGrid, Boxes, ThermometerSun, ShieldCheck, BarChart3, Pencil } from 'lucide-react'
import { useUIStore, type AppView } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { NotificationBell } from '../notifications/NotificationCenter'
import { AIAssistant } from '../ai/AIAssistant'
import { cn } from '../../lib/utils'

const nav: { id: AppView; label: string; Icon: React.ElementType }[] = [
  { id: 'home', label: 'Home', Icon: LayoutGrid },
  { id: 'areas', label: 'Aree', Icon: Boxes },
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
  ai,
}: {
  active?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
  badge?: number
  ai?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      className={cn(
        'group relative flex h-11 w-11 items-center justify-center rounded-[16px] transition-colors',
        ai
          ? 'text-white'
          : active
            ? 'bg-black/10 text-[#1d1d1f]'
            : 'text-black/40 hover:bg-black/5 hover:text-[#1d1d1f]',
      )}
      style={ai ? { background: 'var(--ai-gradient)' } : undefined}
    >
      {active && !ai && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-[16px] bg-black/10"
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      {/* Tooltip pill — matches design system rail-tip */}
      <span
        className="pointer-events-none absolute left-[54px] top-1/2 z-50 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg px-[10px] py-[5px] text-xs font-semibold text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100"
        style={{ background: 'var(--ink)', letterSpacing: '-0.1px', transformOrigin: 'left center' }}
      >
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
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-semibold text-white ring-1 ring-black/5">
          <Home size={18} className="text-white" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white',
            connected ? 'bg-green-400' : connectionStatus === 'connecting' ? 'bg-orange-400' : 'bg-red-400',
          )}
        />
      </div>

      <div className="my-1 h-px w-7 bg-black/10" />

      {nav.map(({ id, label, Icon }) => (
        <RailButton key={id} active={activeView === id} label={label} onClick={() => setActiveView(id)}>
          <Icon size={20} />
        </RailButton>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <AIAssistant />  {/* uses ai prop → gradient bg handled in AIAssistant itself */}
        <RailButton label="Modifica" onClick={() => setActiveView('settings')} active={activeView === 'settings'}>
          <Pencil size={18} />
        </RailButton>
        <NotificationBell />
      </div>
    </nav>
  )
}
