import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock } from 'lucide-react'
import { AnimatedCard } from '../../anim/AnimatedCard'
import { LiveDot } from '../../anim/LiveDot'
import { calendarApi, type WidgetSize } from '../../../api/backend'
import { calendarEventsFromBackend } from '../../../lib/calendarEvents'

function formatWhen(start: number, ongoing: boolean, allDay: boolean): string {
  if (ongoing) return 'In corso'
  const d = new Date(start)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (allDay && sameDay) return 'Oggi · tutto il giorno'
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (allDay && d.toDateString() === tomorrow.toDateString()) return 'Domani · tutto il giorno'
  if (allDay) return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · tutto il giorno'
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Oggi ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Domani ${time}`
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + ` ${time}`
}

/** Upcoming events from the calendar link configured in the S.I.M.I. backend. */
export function CalendarWidget({ size }: { size: WidgetSize }) {
  const showList = size === 'lg' || size === 'wide'
  const linkedCalendar = useQuery({
    queryKey: ['calendar-events'],
    queryFn: calendarApi.events,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  })

  const events = useMemo(() => {
    // React Query supplies a stable clock tick whenever this feed refreshes.
    const now = linkedCalendar.dataUpdatedAt
    return calendarEventsFromBackend(linkedCalendar.data?.events ?? [], now)
  }, [linkedCalendar.data?.events, linkedCalendar.dataUpdatedAt])

  const next = events[0]

  return (
    <AnimatedCard depth ambient="drift" ambientColor="rgba(124,58,237,0.19)" index={7} contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.05] text-[#7c3aed]">
          <CalendarDays size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-black/90">Calendario</p>
          <p className="truncate text-xs text-black/45">
            {events.length
              ? `${events.length} ${events.length === 1 ? 'evento' : 'eventi'}`
              : linkedCalendar.isPending
                ? 'Collegamento calendario…'
                : linkedCalendar.isError
                  ? 'Calendario non raggiungibile'
                  : linkedCalendar.data?.configured ? 'Nessun evento' : 'Collega un calendario da Funzioni'}
          </p>
        </div>
        {next?.ongoing && <LiveDot color="#7c3aed" />}
      </div>

      {!next ? (
        <p className="mt-1 text-xs text-black/40">
          {linkedCalendar.isError ? 'Il link non risponde. Nuovo tentativo automatico tra poco.' : 'Nessun evento in programma.'}
        </p>
      ) : showList ? (
        <div className="mt-1 min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {events.slice(0, 4).map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: e.ongoing ? '#7c3aed' : 'rgba(124,58,237,0.3)' }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-black/85">{e.title}</p>
                <p className="truncate text-[11px] text-black/45">{formatWhen(e.start, e.ongoing, e.allDay)} · {e.calendar}{e.location ? ` · ${e.location}` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto">
          <p className="truncate text-base font-semibold text-black/90">{next.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-black/50"><Clock size={12} /> {formatWhen(next.start, next.ongoing, next.allDay)}</p>
        </div>
      )}
    </AnimatedCard>
  )
}
