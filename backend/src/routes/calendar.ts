import { Hono } from 'hono'
import { db } from '../db/client.js'
import { parseCalendarFeed, type CalendarFeedEvent } from '../lib/calendar-feed.js'
import { BoundedTtlCache, OutboundRequestError, fetchWithLimits } from '../lib/request-safety.js'

const CALENDAR_TTL_MS = 5 * 60 * 1_000
const MAX_CALENDAR_BYTES = 1_500_000
const calendarCache = new BoundedTtlCache<CalendarFeedEvent[]>(8)
const pendingCalendars = new Map<string, Promise<CalendarFeedEvent[]>>()

export const calendarRouter = new Hono()

async function configuredCalendarUrl(): Promise<string> {
  return (await db.read()).config.calendarFeedUrl?.trim() ?? ''
}

async function loadCalendar(sourceUrl: string): Promise<CalendarFeedEvent[]> {
  const cached = calendarCache.get(sourceUrl)
  if (cached) return cached
  const pending = pendingCalendars.get(sourceUrl)
  if (pending) return pending
  if (pendingCalendars.size >= 8) throw new OutboundRequestError('network')

  const task = (async () => {
    const { response, bytes } = await fetchWithLimits(
      sourceUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'text/calendar, application/ics, text/plain;q=0.8',
          'User-Agent': 'S.I.M.I./1.0 calendar reader',
        },
      },
      {
        timeoutMs: 10_000,
        maxBytes: MAX_CALENDAR_BYTES,
        maxRedirects: 4,
        requirePublicHttps: true,
      },
    )
    if (!response.ok) throw new OutboundRequestError('network')
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType && !/(?:calendar|ics|text\/plain|xml|application\/octet-stream)/.test(contentType)) {
      throw new OutboundRequestError('invalid_response')
    }

    let source: string
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new OutboundRequestError('invalid_response')
    }
    if (!source.includes('BEGIN:VCALENDAR')) throw new OutboundRequestError('invalid_response')
    const events = await parseCalendarFeed(source)
    calendarCache.set(sourceUrl, events, CALENDAR_TTL_MS)
    return events
  })().finally(() => pendingCalendars.delete(sourceUrl))

  pendingCalendars.set(sourceUrl, task)
  return task
}

calendarRouter.get('/', async (c) => {
  if (c.req.query('url') !== undefined || c.req.query('calendarUrl') !== undefined) {
    return c.json({ error: 'Il calendario si configura nelle Funzioni, non nella richiesta' }, 400)
  }
  const sourceUrl = await configuredCalendarUrl()
  if (!sourceUrl) return c.json({ configured: false, events: [] })

  try {
    const events = await loadCalendar(sourceUrl)
    c.header('Cache-Control', 'private, max-age=60')
    return c.json({ configured: true, events })
  } catch (error) {
    if (error instanceof OutboundRequestError && error.reason === 'unsafe_url') {
      return c.json({ error: 'Calendario non consentito: usa un link HTTPS pubblico' }, 400)
    }
    if (error instanceof OutboundRequestError && error.reason === 'timeout') {
      return c.json({ error: 'Il calendario non ha risposto in tempo' }, 504)
    }
    return c.json({ error: 'Calendario temporaneamente non disponibile' }, 502)
  }
})
