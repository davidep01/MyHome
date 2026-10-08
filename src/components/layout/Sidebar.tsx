import { ExternalLink, LogOut } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUIStore, VIEW_PATHS } from '../../store/ui'
import { useEntityStore } from '../../store/entities'
import { NotificationBell } from '../notifications/NotificationCenter'
import { authApi } from '../../api/backend'
import { BrandMark } from '../ui/BrandMark'
import { ADMIN_NAVIGATION } from './adminNavigation'
import { cn } from '../../lib/utils'

export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const connectionStatus = useEntityStore((s) => s.connectionStatus)
  const queryClient = useQueryClient()
  const { data: auth } = useQuery({ queryKey: ['auth-status'], queryFn: authApi.status, staleTime: 30_000 })
  const logout = async () => {
    await authApi.logout()
    queryClient.clear()
    window.location.assign('/')
  }

  return (
    <nav aria-label="Navigazione principale" className="admin-sidebar flex h-full w-[204px] flex-col gap-6 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-solid)] p-4 lg:w-[232px]">
      <div className="flex items-center gap-3 px-2 pt-2">
        <BrandMark size={52} />
        <p className="text-sm font-semibold text-[var(--ink-secondary)]">Regia della casa</p>
      </div>
      <div className="flex flex-col gap-2">
        {ADMIN_NAVIGATION.map(({ id, label, description, Icon }) => (
          <a key={id} href={VIEW_PATHS[id]} aria-current={activeView === id ? 'page' : undefined}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault(); setActiveView(id)
            }}
            className={cn('flex min-h-[64px] items-center gap-3 rounded-[14px] px-3 transition-colors', activeView === id ? 'bg-[var(--fill-muted)] text-[var(--action-blue)]' : 'text-[var(--ink-secondary)] hover:bg-[var(--fill-subtle)]')}>
            <Icon size={20} className="shrink-0" /><div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-[11px] text-[var(--ink-tertiary)]">{description}</p></div>
          </a>
        ))}
      </div>
      <div className="mt-auto space-y-4 border-t border-[var(--hairline)] pt-4">
        <div className="px-2 text-xs text-[var(--ink-secondary)]" role="status">
          <p className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', connectionStatus === 'connected' ? 'bg-[var(--ok-green)]' : 'bg-[var(--alert-orange)]')} />{connectionStatus === 'connected' ? 'Home Assistant connesso' : 'Home Assistant non connesso'}</p>
        </div>
        <a href="/kiosk" target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-2 rounded-[12px] bg-[var(--fill-subtle)] px-3 text-sm font-semibold text-[var(--ink)]">Apri dashboard <ExternalLink size={16} /></a>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs tabular-nums text-[var(--ink-tertiary)]">v{__APP_VERSION__}</span><NotificationBell />
          {auth?.mode === 'required' && <button type="button" onClick={() => { void logout() }} aria-label="Termina sessione" className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"><LogOut size={18} /></button>}
        </div>
      </div>
    </nav>
  )
}
