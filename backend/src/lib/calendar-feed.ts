import ical, { type ParameterValue, type VEvent } from 'node-ical'
import { stripControlCharacters } from './request-safety.js'

const DAY_MS = 24 * 60 * 60 * 1_000
const DEFAULT_EVENT_MS = 60 * 60 * 1_000
const MAX_EVENTS = 40

export interface CalendarFeedEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
  location?: string
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return stripControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function parameterText(value: ParameterValue | undefined): string {
  if (typeof value === 'string') return value
  return value?.val ?? ''
}

function isEvent(value: unknown): value is VEvent {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'VEVENT'
}

function toResult(
  event: VEvent,
  start: Date,
  end: Date | undefined,
  allDay: boolean,
  calendar: string,
): CalendarFeedEvent | null {
  const startMs = start.getTime()
  const endMs = end?.getTime() ?? startMs + (allDay ? DAY_MS : DEFAULT_EVENT_MS)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  const normalizedEnd = Math.max(startMs, endMs)
  const location = cleanText(parameterText(event.location), 200)
  const title = cleanText(parameterText(event.summary), 240) || 'Evento'
  const uid = cleanText(event.uid, 240) || 'event'
  return {
    id: `${uid}-${new Date(startMs).toISOString()}`,
    title,
    start: new Date(startMs).toISOString(),
    end: new Date(normalizedEnd).toISOString(),
    allDay,
    calendar,
    ...(location ? { location } : {}),
  }
}

/** Parse an iCalendar feed and expand recurring events in a bounded time window. */
export async function parseCalendarFeed(
  source: string,
  now = new Date(),
  horizonDays = 60,
): Promise<CalendarFeedEvent[]> {
  const parsed = await ical.async.parseICS(source)
  const calendar = cleanText(parsed.vcalendar?.['WR-CALNAME'], 100) || 'Calendario collegato'
  const from = new Date(now.getTime() - DAY_MS)
  const to = new Date(now.getTime() + Math.max(1, Math.min(horizonDays, 366)) * DAY_MS)
  const events: CalendarFeedEvent[] = []

  for (const component of Object.values(parsed)) {
    if (!isEvent(component) || component.status === 'CANCELLED' || component.recurrenceid) continue

    if (component.rrule) {
      for (const instance of ical.expandRecurringEvent(component, {
        from,
        to,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      })) {
        if (instance.end.getTime() < now.getTime()) continue
        const result = toResult(instance.event, instance.start, instance.end, instance.isFullDay, calendar)
        if (result) events.push(result)
      }
      continue
    }

    const allDay = component.datetype === 'date' || component.start.dateOnly === true
    const end = component.end ?? new Date(component.start.getTime() + (allDay ? DAY_MS : DEFAULT_EVENT_MS))
    if (end.getTime() < now.getTime() || component.start.getTime() > to.getTime()) continue
    const result = toResult(component, component.start, end, allDay, calendar)
    if (result) events.push(result)
  }

  return events
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start) || left.title.localeCompare(right.title, 'it'))
    .slice(0, MAX_EVENTS)
}
