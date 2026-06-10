import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, History, Lock, ShieldCheck, User, Zap } from 'lucide-react'
import { GlassSheet } from '../../glass/GlassSheet'
import { haApi } from '../../../api/backend'
import { useDoorbellEvents } from '../../../store/doorbellEvents'
import { stateLabel } from '../../widgets/utils/stateLabel'
import { cn } from '../../../lib/utils'

interface TimelineItem {
  key: string
  when: number
  icon: React.ElementType
  title: string
  detail: string
  tone: 'neutral' | 'warn' | 'ok'
}

const DOMAIN_ICON: Record<string, React.ElementType> = {
  person: User,
  alarm_control_panel: ShieldCheck,
  lock: Lock,
  automation: Zap,
}

/**
 * Timeline di casa (M4): "cosa è successo oggi" — logbook HA filtrato alle
 * classi significative + gli eventi campanello locali. Aperta dal tocco
 * sull'orologio dell'header.
 */
export function TimelineSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doorbell = useDoorbellEvents((s) => s.events)
  const { data: logbook, isLoading } = useQuery({
    queryKey: ['ha-logbook'],
    enabled: open,
    staleTime: 60_000,
    queryFn: () => haApi.logbook(24),
  })

  const items = useMemo<TimelineItem[]>(() => {
    const list: TimelineItem[] = []
    for (const entry of logbook ?? []) {
      const when = entry.when ? Date.parse(entry.when) : NaN
      if (!Number.isFinite(when) || !entry.entity_id) continue
      const domain = entry.entity_id.split('.')[0]
      list.push({
        key: `${entry.entity_id}-${when}`,
        when,
        icon: DOMAIN_ICON[domain] ?? History,
        title: entry.name ?? entry.entity_id,
        detail: entry.state ? stateLabel(entry.state) : entry.message ?? '',
        tone: domain === 'alarm_control_panel' && entry.state === 'triggered' ? 'warn'
          : domain === 'person' && entry.state === 'home' ? 'ok' : 'neutral',
      })
    }
    for (const event of doorbell) {
      const when = Date.parse(event.timestamp)
      if (!Number.isFinite(when)) continue
      list.push({
        key: `doorbell-${event.id}`,
        when,
        icon: Bell,
        title: event.doorbellName,
        detail: event.type === 'press' ? 'Campanello suonato' : event.message ?? event.type,
        tone: 'warn',
      })
    }
    return list.sort((a, b) => b.when - a.when).slice(0, 60)
  }, [logbook, doorbell])

  return (
    <GlassSheet open={open} onClose={onClose} title="Oggi a casa" side="center">
      <div className="w-full space-y-1.5">
        {isLoading && <p className="py-8 text-center text-sm text-black/35">Caricamento…</p>}
        {!isLoading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-black/35">Nessun evento nelle ultime 24 ore.</p>
        )}
        {items.map((item) => (
          <div key={item.key} className="flex min-h-[52px] items-center gap-3 rounded-[12px] bg-black/[0.04] px-3 py-2">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              item.tone === 'warn' ? 'bg-orange-500/14 text-[#c2410c]' : item.tone === 'ok' ? 'bg-green-500/12 text-green-700' : 'bg-black/[0.06] text-black/50',
            )}>
              <item.icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#1d1d1f]">{item.title}</p>
              <p className="truncate text-xs text-black/45">{item.detail}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-black/35">
              {new Date(item.when).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </GlassSheet>
  )
}
