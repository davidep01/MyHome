import { GlassSheet } from '../../glass/GlassSheet'
import { agendaDays, agendaForDay } from '../../../lib/calendarAgenda'
import type { CalendarEvent } from '../../../lib/calendarEvents'
import { useClock } from '../../../hooks/useClock'
import { useMemo, useState } from 'react'
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
  const { now } = useClock()
  const showList = size === 'lg'
  const [agendaOpen,setAgendaOpen] = useState(false)
  const [selected,setSelected] = useState<CalendarEvent | null>(null)
  const [dayIndex,setDayIndex] = useState(0)
  const days = agendaDays(now)
  const linkedCalendar = useQuery({
    queryKey: ['calendar-events'],
    queryFn: calendarApi.events,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  })

  const events = useMemo(() => {
    return calendarEventsFromBackend(linkedCalendar.data?.events ?? [], now.getTime())
  }, [linkedCalendar.data?.events, now])

  const next = events[0]
  if (size === 'xs') return <AnimatedCard className="h-full" contentClassName="gap-1">
    <p className="line-clamp-2 text-[13px] font-semibold text-[var(--ink)]">{next?.title ?? 'Calendario'}</p>
    <p className="truncate text-[13px] text-[var(--ink-secondary)]">{next ? formatWhen(next.start, next.ongoing, next.allDay) : linkedCalendar.isError ? 'Non raggiungibile' : linkedCalendar.isPending ? 'Caricamento…' : 'Nessun evento'}</p>
  </AnimatedCard>

  return (
    <>
    <AnimatedCard depth ambient="drift" ambientColor="rgba(124,58,237,0.19)" index={7} className="h-full" contentClassName="gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--fill-subtle)] text-[var(--action-blue)]">
          <CalendarDays size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">Calendario</p>
          <p className="truncate text-[13px] text-[var(--ink-secondary)]">
            {events.length
              ? `${events.length} ${events.length === 1 ? 'evento' : 'eventi'}`
              : linkedCalendar.isPending
                ? 'Collegamento calendario…'
                : linkedCalendar.isError
                  ? 'Calendario non raggiungibile'
                  : linkedCalendar.data?.configured ? 'Nessun evento' : 'Collega un calendario da Funzioni'}
          </p>
        </div>
        {next?.ongoing && <LiveDot color="var(--action-blue)" />}
      </div>

      {linkedCalendar.isError && <button type="button" className="min-h-11 rounded-xl bg-[var(--fill-subtle)] px-3 text-sm text-[var(--ink)]" onClick={()=>void linkedCalendar.refetch()}>Riprova calendario</button>}
      {showList && <div className="flex shrink-0 gap-1 overflow-x-auto" aria-label="Prossimi sette giorni">{days.map((day,i)=><button type="button" key={day.toISOString()} aria-pressed={dayIndex===i} onClick={()=>setDayIndex(i)} className="min-h-11 min-w-11 flex-1 rounded-xl bg-[var(--fill-subtle)] px-1 text-[13px] text-[var(--ink)]" style={dayIndex===i ? {boxShadow:'inset 0 0 0 2px var(--action-blue)'} : undefined}>{day.toLocaleDateString('it-IT',{weekday:'short'})}<br/>{day.getDate()}</button>)}</div>}
      {!next ? (
        <p className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {linkedCalendar.isError ? 'Il link non risponde. Nuovo tentativo automatico tra poco.' : 'Nessun evento in programma.'}
        </p>
      ) : showList ? (
        <div className={'mt-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto'}>
          {agendaForDay(events,days[dayIndex]).map((e) => (
            <button type="button" onClick={()=>setSelected(e)} key={e.id} className="flex min-h-11 w-full items-center gap-2 text-left">
              <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: e.ongoing ? 'var(--action-blue)' : 'var(--ink-tertiary)' }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{e.title}</p>
                <p className="truncate text-[13px] text-[var(--ink-secondary)]">{formatWhen(e.start, e.ongoing, e.allDay)} · {e.calendar}{e.location ? ` · ${e.location}` : ''}</p>
              </div>
            </button>
          ))}
          {!agendaForDay(events,days[dayIndex]).length && <p className="text-sm text-[var(--ink-secondary)]">Nessun evento per questo giorno</p>}
        </div>
      ) : (
        <button type="button" onClick={()=>setAgendaOpen(true)} className="mt-auto min-h-11 text-left" aria-label="Apri agenda">
          <p className="truncate text-base font-semibold text-[var(--ink)]">{next.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-[var(--ink-secondary)]"><Clock size={12} /> {formatWhen(next.start, next.ongoing, next.allDay)}</p>
        </button>
      )}
    </AnimatedCard>
    <GlassSheet open={agendaOpen} onClose={()=>setAgendaOpen(false)} title="Agenda" side="center">
      <div className="space-y-2">{events.map(e=><button type="button" key={e.id} onClick={()=>setSelected(e)} className="flex min-h-11 w-full flex-col rounded-xl bg-[var(--fill-subtle)] px-3 py-2 text-left"><span className="text-sm font-semibold text-[var(--ink)]">{e.title}</span><span className="text-[13px] text-[var(--ink-secondary)]">{formatWhen(e.start,e.ongoing,e.allDay)} · {e.calendar}</span></button>)}</div>
    </GlassSheet>
    <GlassSheet open={Boolean(selected)} onClose={()=>setSelected(null)} title={selected?.title ?? 'Evento'} side="center">
      {selected && <div className="space-y-3 text-sm text-[var(--ink-secondary)]"><p>{formatWhen(selected.start,selected.ongoing,selected.allDay)}</p><p>{selected.calendar}</p>{selected.location && <p>{selected.location}</p>}<p>Fine: {new Date(selected.end).toLocaleString('it-IT')}</p></div>}
    </GlassSheet>
    </>
  )
}
