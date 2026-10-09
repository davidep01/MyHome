import { addDays, weekdayOf } from '../domain/time.js'
import { isLocalDate } from '../domain/schema.js'

/**
 * Sottoinsieme RRULE (RFC 5545) per le regole di raccolta inserite a mano.
 *
 * Supportati: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (con ordinale solo
 * per MONTHLY, es. 1TU, -1FR), BYMONTHDAY, COUNT, UNTIL. Qualunque altra
 * parte produce un errore visibile, mai un calendario parzialmente inventato.
 * L'espansione lavora su date civili: l'ora si applica dopo, nella timezone
 * del calendario.
 */

const DAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 }
const SUPPORTED = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'COUNT', 'UNTIL', 'WKST'])
const MAX_ITERATIONS = 5_000

export class UnsupportedRecurrence extends Error {
  constructor(message: string) { super(message); this.name = 'UnsupportedRecurrence' }
}

interface ParsedRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  byDay: { ordinal: number | null; weekday: number }[]
  byMonthDay: number[]
  count: number | null
  until: string | null
}

export function parseRRule(value: string): ParsedRule {
  const parts = new Map<string, string>()
  for (const chunk of value.replace(/^RRULE:/i, '').split(';')) {
    if (!chunk.trim()) continue
    const [key, val] = chunk.split('=')
    const name = key?.trim().toUpperCase()
    if (!name || val === undefined) throw new UnsupportedRecurrence(`parte non valida: ${chunk.slice(0, 40)}`)
    if (!SUPPORTED.has(name)) throw new UnsupportedRecurrence(`ricorrenza non supportata: ${name}`)
    parts.set(name, val.trim().toUpperCase())
  }
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') throw new UnsupportedRecurrence(`FREQ non supportata: ${freq ?? 'assente'}`)
  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) throw new UnsupportedRecurrence('INTERVAL non valido')

  const byDay = (parts.get('BYDAY') ?? '').split(',').filter(Boolean).map((token) => {
    const m = /^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token)
    if (!m) throw new UnsupportedRecurrence(`BYDAY non valido: ${token}`)
    const ordinal = m[1] ? Number(m[1]) : null
    if (ordinal !== null && freq !== 'MONTHLY') throw new UnsupportedRecurrence('ordinale in BYDAY ammesso solo con FREQ=MONTHLY')
    if (ordinal !== null && (ordinal === 0 || ordinal < -5 || ordinal > 5)) throw new UnsupportedRecurrence('ordinale BYDAY non valido')
    return { ordinal, weekday: DAYS[m[2]] }
  })
  if (byDay.length && freq === 'DAILY') throw new UnsupportedRecurrence('BYDAY con FREQ=DAILY non supportato')

  const byMonthDay = (parts.get('BYMONTHDAY') ?? '').split(',').filter(Boolean).map((token) => {
    const n = Number(token)
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new UnsupportedRecurrence(`BYMONTHDAY non valido: ${token}`)
    return n
  })
  if (byMonthDay.length && freq !== 'MONTHLY') throw new UnsupportedRecurrence('BYMONTHDAY ammesso solo con FREQ=MONTHLY')
  if (byMonthDay.length && byDay.length) throw new UnsupportedRecurrence('BYMONTHDAY e BYDAY insieme non supportati')

  const count = parts.has('COUNT') ? Number(parts.get('COUNT')) : null
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 1_000)) throw new UnsupportedRecurrence('COUNT non valido')
  let until: string | null = null
  if (parts.has('UNTIL')) {
    const raw = parts.get('UNTIL')!
    const m = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(raw)
    if (!m) throw new UnsupportedRecurrence('UNTIL non valido')
    until = `${m[1]}-${m[2]}-${m[3]}`
    if (!isLocalDate(until)) throw new UnsupportedRecurrence('UNTIL non valido')
  }
  if (count !== null && until !== null) throw new UnsupportedRecurrence('COUNT e UNTIL insieme non ammessi')
  return { freq, interval, byDay, byMonthDay, count, until }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function monthDates(year: number, month: number, rule: ParsedRule, dtstartDay: number): string[] {
  const pad = (n: number) => String(n).padStart(2, '0')
  const total = daysInMonth(year, month)
  const out: number[] = []
  if (rule.byMonthDay.length) {
    for (const day of rule.byMonthDay) if (day <= total) out.push(day)
  } else if (rule.byDay.length) {
    for (const { ordinal, weekday } of rule.byDay) {
      const matches: number[] = []
      for (let d = 1; d <= total; d += 1) if (weekdayOf(`${year}-${pad(month)}-${pad(d)}`) === weekday) matches.push(d)
      if (ordinal === null) out.push(...matches)
      else {
        const pick = ordinal > 0 ? matches[ordinal - 1] : matches[matches.length + ordinal]
        if (pick) out.push(pick)
      }
    }
  } else if (dtstartDay <= total) {
    out.push(dtstartDay)
  }
  return [...new Set(out)].sort((a, b) => a - b).map((d) => `${year}-${pad(month)}-${pad(d)}`)
}

/** Date civili della ricorrenza dentro [from, to] (inclusi). */
export function expandRRule(value: string, dtstart: string, from: string, to: string): string[] {
  const rule = parseRRule(value)
  const out: string[] = []
  let produced = 0
  const accept = (date: string): boolean => {
    if (date < dtstart) return true
    if (rule.until && date > rule.until) return false
    produced += 1
    if (rule.count !== null && produced > rule.count) return false
    if (date >= from && date <= to) out.push(date)
    return date <= to || rule.count !== null
  }

  if (rule.freq === 'DAILY') {
    let date = dtstart
    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      if (!accept(date)) break
      if (date > to && rule.count === null) break
      date = addDays(date, rule.interval)
    }
  } else if (rule.freq === 'WEEKLY') {
    const weekdays = rule.byDay.length ? rule.byDay.map((d) => d.weekday).sort((a, b) => a - b) : [weekdayOf(dtstart)]
    let weekStart = addDays(dtstart, 1 - weekdayOf(dtstart))
    outer: for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      for (const weekday of weekdays) {
        const date = addDays(weekStart, weekday - 1)
        if (!accept(date)) break outer
        if (date > to && rule.count === null) break outer
      }
      weekStart = addDays(weekStart, 7 * rule.interval)
    }
  } else {
    const [y, m, d] = dtstart.split('-').map(Number)
    let year = y
    let month = m
    outer: for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      for (const date of monthDates(year, month, rule, d)) {
        if (!accept(date)) break outer
        if (date > to && rule.count === null) break outer
      }
      month += rule.interval
      while (month > 12) { month -= 12; year += 1 }
    }
  }
  return out
}
