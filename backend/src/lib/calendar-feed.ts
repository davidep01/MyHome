import { runBoundedWorker } from './bounded-worker.js'
export type { CalendarFeedEvent } from './calendar-parser.js'
import type { CalendarFeedEvent } from './calendar-parser.js'

/** Parsing cannot block API/HA; workers have resource, concurrency and time limits. */
export async function parseCalendarFeed(source: string, now = new Date(), horizonDays = 60): Promise<CalendarFeedEvent[]> {
  if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) throw new Error('Calendario troppo grande')
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(horizonDays)) throw new Error('Intervallo calendario non valido')
  return runBoundedWorker('calendar-worker', { source, now: now.toISOString(), horizonDays })
}
