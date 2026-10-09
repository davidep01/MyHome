/**
 * Tempo civile e istanti, senza dipendenze.
 *
 * Gli istanti si persistono in UTC; il calendario civile (giorno della
 * settimana, "il giorno prima", orario di un promemoria) si calcola sempre in
 * una timezone IANA esplicita tramite `Intl`. Non si sommano mai offset fissi:
 * il 25 ottobre 2026 a Roma le 02:30 esistono due volte e il 29 marzo 2026 non
 * esistono affatto. Le regole per quei casi sono qui e solo qui.
 */

export interface Clock { now(): Date }

export const systemClock: Clock = { now: () => new Date() }

/** Orologio controllato per test, replay e simulazioni riproducibili. */
export class ManualClock implements Clock {
  private current: number
  constructor(start: string | Date) { this.current = new Date(start).getTime() }
  now(): Date { return new Date(this.current) }
  set(at: string | Date): void { this.current = new Date(at).getTime() }
  advance(ms: number): void { this.current += ms }
}

export type Daypart = 'night' | 'morning' | 'afternoon' | 'evening'
export type TimeResolution = 'exact' | 'shifted_forward' | 'first_of_ambiguous'

export interface LocalParts {
  date: string
  time: string
  weekday: number // 1 = lunedì … 7 = domenica
  hour: number
  minute: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'short',
    })
    formatters.set(tz, f)
  }
  return f
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function wallParts(instant: Date, tz: string) {
  const parts: Record<string, string> = {}
  for (const part of formatter(tz).formatToParts(instant)) parts[part.type] = part.value
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday] ?? 1,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function localParts(instant: Date, tz: string): LocalParts {
  const p = wallParts(instant, tz)
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    weekday: p.weekday,
    hour: p.hour,
    minute: p.minute,
  }
}

/** Offset (minuti) della timezone in quell'istante. */
export function offsetMinutes(instant: Date, tz: string): number {
  const p = wallParts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

function wallMillis(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, h, mi)
}

function matchesWall(utc: number, date: string, time: string, tz: string): boolean {
  const parts = localParts(new Date(utc), tz)
  return parts.date === date && parts.time === time
}

/**
 * Istante di un'ora civile. Politica dichiarata (specifica §26):
 * - ora inesistente (salto in avanti) → primo istante locale valido dopo il salto;
 * - ora ripetuta (salto indietro) → la PRIMA delle due occorrenze, mai entrambe.
 */
export function zonedInstant(date: string, time: string, tz: string): { instant: Date; resolution: TimeResolution } {
  const wall = wallMillis(date, time)
  const offsets = new Set([
    offsetMinutes(new Date(wall - 86_400_000), tz),
    offsetMinutes(new Date(wall), tz),
    offsetMinutes(new Date(wall + 86_400_000), tz),
  ])
  const valid = [...offsets]
    .map((offset) => wall - offset * 60_000)
    .filter((utc) => matchesWall(utc, date, time, tz))
    .sort((a, b) => a - b)
  if (valid.length === 1) return { instant: new Date(valid[0]), resolution: 'exact' }
  if (valid.length > 1) return { instant: new Date(valid[0]), resolution: 'first_of_ambiguous' }

  // Ora nel buco del cambio d'ora: cerca il primo minuto valido successivo.
  const sorted = [...offsets].sort((a, b) => a - b)
  let lo = wall - sorted[sorted.length - 1] * 60_000
  let hi = wall - sorted[0] * 60_000
  if (lo >= hi) return { instant: new Date(hi), resolution: 'shifted_forward' }
  const offsetAfter = offsetMinutes(new Date(hi), tz)
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000
    if (offsetMinutes(new Date(mid), tz) === offsetAfter) hi = mid
    else lo = mid
  }
  return { instant: new Date(hi), resolution: 'shifted_forward' }
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

/** Giorno della settimana di una data civile (1 = lunedì). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

export function daysBetween(from: string, to: string): number {
  return Math.round((wallMillis(to, '00:00') - wallMillis(from, '00:00')) / 86_400_000)
}

export function daypartOf(hour: number): Daypart {
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** true se `time` (HH:mm) cade nella fascia [from, until), anche a cavallo della mezzanotte. */
export function inTimeWindow(time: string, from: string, until: string): boolean {
  if (from === until) return false
  return from < until ? time >= from && time < until : time >= from || time < until
}

export function iso(date: Date): string {
  return date.toISOString()
}
