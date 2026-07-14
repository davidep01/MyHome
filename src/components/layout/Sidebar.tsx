import { motion } from 'framer-motion'
import { ActivitySquare, Boxes, ExternalLink, Home, LayoutGrid, LogOut, SlidersHorizontal } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUIStore, VIEW_PATHS, type AppView } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { NotificationBell } from '../notifications/NotificationCenter'
import { cn } from '../../lib/utils'
import { authApi } from '../../api/backend'

/** La regia ha 4 viste; il controllo della casa è il kiosk (link in basso). */
const nav: { id: AppView; label: string; Icon: React.ElementType }[] = [
  { id: 'home', label: 'Stato', Icon: LayoutGrid },
  { id: 'entities', label: 'Entità', Icon: Boxes },
  { id: 'functions', label: 'Funzioni', Icon: SlidersHorizontal },
  { id: 'system', label: 'Sistema', Icon: ActivitySquare },
]

function RailButton({
  active,
  label,
  onClick,
  children,
  href,
  newTab = false,
}: {
  active?: boolean
  label: string
  onClick?: () => void
  children: React.ReactNode
  href?: string
  newTab?: boolean
}) {
  const className = cn(
    'group relative flex h-11 w-11 items-center justify-center rounded-[16px] transition-colors',
    active ? 'text-[#1d1d1f]' : 'text-black/40 hover:bg-black/5 hover:text-[#1d1d1f]',
  )
  const inner = (
    <>
      {active && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-[16px] bg-black/10"
          aria-hidden="true"
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
      {/* Tooltip pill — matches design system rail-tip */}
      <span
        className="pointer-events-none absolute left-[54px] top-1/2 z-50 -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg px-[10px] py-[5px] text-xs font-semibold text-white opacity-0 transition-[opacity,transform] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
        style={{ background: 'var(--ink)', letterSpacing: '-0.1px', transformOrigin: 'left center' }}
      >
        {label}
      </span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noreferrer' : undefined}
        onClick={(event) => {
          if (newTab || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
          if (onClick) {
            event.preventDefault()
            onClick()
          }
        }}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={className}
      >
        {inner}
      </a>
    )
  }
  return (
    <motion.button type="button" onClick={onClick} whileTap={{ scale: 0.9 }} aria-label={label} aria-current={active ? 'page' : undefined} className={className}>
      {inner}
    </motion.button>
  )
}

export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const connected = connectionStatus === 'connected'
  const queryClient = useQueryClient()
  const { data: auth } = useQuery({ queryKey: ['auth-status'], queryFn: authApi.status, staleTime: 30_000 })

  const logout = async () => {
    await authApi.logout()
    queryClient.clear()
    window.location.assign('/')
  }

  return (
    <nav aria-label="Navigazione principale" className="glass glass-border flex h-full w-[68px] flex-col items-center gap-2 overflow-y-auto rounded-[24px] py-4">
      {/* Avatar + connection dot */}
      <div className="relative mb-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0066cc] text-sm font-semibold text-white ring-1 ring-black/5">
          <Home size={18} className="text-white" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white',
            connected ? 'bg-green-400' : connectionStatus === 'connecting' ? 'bg-orange-400' : 'bg-red-400',
          )}
          role="status"
          aria-label={connected ? 'Home Assistant connesso' : connectionStatus === 'connecting' ? 'Connessione a Home Assistant in corso' : 'Home Assistant non connesso'}
        />
      </div>

      <div className="my-1 h-px w-7 bg-black/10" />

      {nav.map(({ id, label, Icon }) => (
        <RailButton key={id} active={activeView === id} label={label} href={VIEW_PATHS[id]} onClick={() => setActiveView(id)}>
          <Icon size={20} />
        </RailButton>
      ))}

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailButton label="Apri dashboard" href="/kiosk" newTab>
          <ExternalLink size={18} />
        </RailButton>
        <NotificationBell />
        {auth?.mode === 'required' && (
          <RailButton label="Termina sessione" onClick={() => { void logout() }}>
            <LogOut size={18} />
          </RailButton>
        )}
        <span className="select-none text-[9px] font-normal tabular-nums text-black/25" title="Versione build">v{__APP_VERSION__}</span>
      </div>
    </nav>
  )
}
