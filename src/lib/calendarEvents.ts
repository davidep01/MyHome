import type { LinkedCalendarEvent } from '../api/backend'

export interface CalendarEvent {
  id: string
  title: string
  start: number
  end: number
  ongoing: boolean
  allDay: boolean
  calendar: string
  location?: string
}

/** Converts only the calendar feeds configured in the S.I.M.I. backend. */
export function calendarEventsFromBackend(
  events: LinkedCalendarEvent[],
  now: number,
): CalendarEvent[] {
  return events
    .map((event): CalendarEvent => {
      const start = Date.parse(event.start)
      const end = Date.parse(event.end)
      return {
        ...event,
        start,
        end,
        ongoing: start <= now && end > now,
      }
    })
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end) && event.end >= now)
    .sort((left, right) => Number(right.ongoing) - Number(left.ongoing) || left.start - right.start)
}
