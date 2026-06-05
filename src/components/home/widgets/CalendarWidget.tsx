import { useMemo } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { useEntityStore } from '../../../store/entities'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'
import type { WidgetSize } from '../../../api/backend'

interface Evt { title: string; start: number; ongoing: boolean; calendar: string; location?: string }

function formatWhen(start: number, ongoing: boolean): string {
  if (ongoing) return 'In corso'
  const d = new Date(start)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Oggi ${time}`
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `Domani ${time}`
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`
}

/** Upcoming events from HA calendar.* entities. */
export function CalendarWidget({ size }: { size: WidgetSize }) {
  const entities = useEntityStore((s) => s.entities)
  const showList = size === 'lg' || size === 'wide'

  const events = useMemo<Evt[]>(() => {
    return Object.values(entities)
      .filter((e) => e.entity_id.startsWith('calendar.'))
      .map((e) => {
        const a = e.attributes ?? {}
        const startRaw = (a.start_time as string | undefined) ?? (a.start as string | undefined)
        const start = startRaw ? new Date(startRaw.replace(' ', 'T')).getTime() : NaN
        return {
          title: (a.message as string | undefined) ?? 'Evento',
          start,
          ongoing: e.state === 'on',
          calendar: (a.friendly_name as string | undefined) ?? e.entity_id.split('.')[1],
          location: a.location as string | undefined,
        }
      })
      .filter((e) => Number.isFinite(e.start))
      .sort((a, b) => (a.ongoing ? -1 : 0) - (b.ongoing ? -1 : 0) || a.start - b.start)
  }, [entities])

  const next = events[0]

  return (
    <AnimatedCard ambient="drift" ambientColor="rgba(124,58,237,0.12)" index={7} contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-[#7c3aed]">
          <CalendarDays size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black/90">Calendario</p>
          <p className="truncate text-xs text-black/45">{events.length ? `${events.length} eventi` : 'Nessun evento'}</p>
        </div>
        {next?.ongoing && <LiveDot color="#7c3aed" />}
      </div>

      {!next ? (
        <p className="mt-1 text-xs text-black/40">Nessun evento in programma.</p>
      ) : showList ? (
        <div className="mt-1 min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {events.slice(0, 4).map((e, idx) => (
            <div key={`${e.title}-${idx}`} className="flex items-center gap-2">
              <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: e.ongoing ? '#7c3aed' : 'rgba(124,58,237,0.3)' }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black/85">{e.title}</p>
                <p className="truncate text-[11px] text-black/45">{formatWhen(e.start, e.ongoing)}{e.location ? ` · ${e.location}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto">
          <p className="truncate text-base font-semibold text-black/90">{next.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-black/50"><Clock size={12} /> {formatWhen(next.start, next.ongoing)}</p>
        </div>
      )}
    </AnimatedCard>
  )
}
