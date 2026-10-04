import type { CalendarEvent } from './calendarEvents'
/** Local calendar days, preserving DST and all-day exclusive end semantics. */
export function agendaDays(now: Date): Date[] {
  return Array.from({length:7},(_,i)=>{const day=new Date(now);day.setHours(0,0,0,0);day.setDate(day.getDate()+i);return day})
}
export function agendaForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const start=new Date(day);start.setHours(0,0,0,0)
  const end=new Date(start);end.setDate(end.getDate()+1)
  return events.filter(e=>e.start < end.getTime() && e.end > start.getTime())
}
