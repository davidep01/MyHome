import type { ReminderOccurrence, WasteCalendar } from '../domain/contracts.js'
import { canonicalHash } from '../domain/ids.js'
import { addDays, localParts, zonedInstant, type TimeResolution } from '../domain/time.js'
import { expandRRule, UnsupportedRecurrence } from './rrule.js'

/**
 * Risoluzione delle occorrenze di raccolta (specifica §13).
 *
 * 1. Ricorrenze espanse solo dentro l'orizzonte (default 60 giorni) e la validità.
 * 2. Eccezioni per singola occorrenza prima della regola ordinaria.
 * 3. Una festività NON sposta la raccolta: serve un'eccezione confermata (T23).
 * 4. Raccolta, finestra di esposizione e promemoria restano tre cose distinte.
 * 5. `day_offset: -1` è il giorno civile precedente, non "24 ore prima".
 */

export interface CalendarIssue { code: string; message: string }

export interface ResolvedOccurrence extends Omit<ReminderOccurrence, 'state' | 'snoozed_until' | 'updated_at'> {
  natural_key: string
}

export interface Resolution {
  occurrences: ResolvedOccurrence[]
  issues: CalendarIssue[]
  /** true se i promemoria possono essere considerati certi. */
  certain: boolean
}

const RESOLUTION_RANK: Record<TimeResolution, number> = { exact: 0, first_of_ambiguous: 1, shifted_forward: 2 }

function worst(a: TimeResolution, b: TimeResolution): TimeResolution {
  return RESOLUTION_RANK[a] >= RESOLUTION_RANK[b] ? a : b
}

/** Verifiche che sospendono i promemoria certi (T25). */
export function calendarIssues(calendar: WasteCalendar, today: string, realHome: boolean): CalendarIssue[] {
  const issues: CalendarIssue[] = []
  if (calendar.approval.state !== 'approved') issues.push({ code: 'CALENDAR_NOT_APPROVED', message: 'Calendario non ancora approvato: verifica l’anteprima.' })
  if (calendar.valid_until < today) issues.push({ code: 'CALENDAR_EXPIRED', message: `Calendario scaduto il ${calendar.valid_until}: serve una nuova versione.` })
  if (!calendar.area.trim()) issues.push({ code: 'AREA_MISSING', message: 'Zona/giro di raccolta non indicata.' })
  if (!calendar.municipality.trim()) issues.push({ code: 'MUNICIPALITY_MISSING', message: 'Comune non indicato.' })
  if (realHome && calendar.demo) issues.push({ code: 'DEMO_CALENDAR', message: 'Il calendario dimostrativo non vale per la casa reale.' })
  return issues
}

export function resolveOccurrences(calendar: WasteCalendar, opts: { today: string; horizonDays: number; realHome: boolean }): Resolution {
  const issues = calendarIssues(calendar, opts.today, opts.realHome)
  const from = opts.today > calendar.valid_from ? opts.today : calendar.valid_from
  const horizonEnd = addDays(opts.today, opts.horizonDays)
  const to = horizonEnd < calendar.valid_until ? horizonEnd : calendar.valid_until
  const labels = new Map(calendar.fractions.map((fraction) => [fraction.id, fraction.label]))
  const occurrences: ResolvedOccurrence[] = []

  if (from > to) return { occurrences, issues, certain: false }

  for (const rule of calendar.rules) {
    let dates: string[]
    try {
      // Si espande anche un po' prima di `from` per catturare le date sostituite che ricadono nell'orizzonte.
      const lookback = addDays(from, -31)
      dates = rule.recurrence.kind === 'dates'
        ? rule.recurrence.dates.filter((date) => date >= lookback && date <= to)
        : expandRRule(rule.recurrence.value, rule.recurrence.dtstart, lookback, to)
    } catch (error) {
      issues.push({ code: 'RECURRENCE_UNSUPPORTED', message: error instanceof UnsupportedRecurrence ? error.message : 'ricorrenza non valida' })
      continue
    }
    const finalDates = new Map<string, { date: string; time: string | null; original: string }>()
    for (const date of dates) finalDates.set(date, { date, time: rule.collection_time, original: date })
    for (const exception of calendar.exceptions.filter((e) => e.rule_id === rule.rule_id)) {
      if (!finalDates.has(exception.original_date)) {
        issues.push({ code: 'EXCEPTION_WITHOUT_OCCURRENCE', message: `Eccezione su ${exception.original_date} senza raccolta ordinaria.` })
        continue
      }
      finalDates.delete(exception.original_date)
      if (exception.kind === 'replace') {
        finalDates.set(`${exception.original_date}>${exception.replacement_date}`, {
          date: exception.replacement_date,
          time: exception.collection_time ?? rule.collection_time,
          original: exception.original_date,
        })
      }
    }

    for (const { date, time, original } of finalDates.values()) {
      if (date < from || date > to) continue
      const exposureFrom = zonedInstant(addDays(date, rule.exposure.start_day_offset), rule.exposure.start_time, calendar.timezone)
      const exposureUntil = zonedInstant(addDays(date, rule.exposure.end_day_offset), rule.exposure.end_time, calendar.timezone)
      rule.reminders.forEach((reminder, index) => {
        const reminderAt = zonedInstant(addDays(date, reminder.day_offset), reminder.at, calendar.timezone)
        const naturalKey = `${calendar.calendar_id}|${rule.rule_id}|${rule.fraction_id}|${original}|${index}`
        occurrences.push({
          natural_key: naturalKey,
          occurrence_id: `occ-${canonicalHash({ naturalKey, revision: calendar.revision, date, time }).slice(0, 20)}`,
          calendar_id: calendar.calendar_id,
          calendar_revision: calendar.revision,
          rule_id: rule.rule_id,
          fraction_id: rule.fraction_id,
          fraction_label: labels.get(rule.fraction_id) ?? rule.fraction_id,
          collection_date: date,
          collection_time: time,
          exposure_from: exposureFrom.instant.toISOString(),
          exposure_until: exposureUntil.instant.toISOString(),
          reminder_at: reminderAt.instant.toISOString(),
          time_resolution: worst(worst(exposureFrom.resolution, exposureUntil.resolution), reminderAt.resolution),
        })
      })
    }
  }
  occurrences.sort((a, b) => a.reminder_at.localeCompare(b.reminder_at) || a.natural_key.localeCompare(b.natural_key))
  return { occurrences, issues, certain: issues.length === 0 }
}

/** Differenze fra due versioni, per l'anteprima prima dell'approvazione (§13.6). */
export function diffResolutions(previous: ResolvedOccurrence[], next: ResolvedOccurrence[]): { added: string[]; removed: string[]; changed: string[] } {
  const fmt = (o: ResolvedOccurrence) => `${o.fraction_label} ${o.collection_date}${o.collection_time ? ` ${o.collection_time}` : ''}`
  const prevByKey = new Map(previous.map((o) => [o.natural_key, o]))
  const nextByKey = new Map(next.map((o) => [o.natural_key, o]))
  const added = next.filter((o) => !prevByKey.has(o.natural_key)).map(fmt)
  const removed = previous.filter((o) => !nextByKey.has(o.natural_key)).map(fmt)
  const changed = next.filter((o) => {
    const prev = prevByKey.get(o.natural_key)
    return prev && (prev.collection_date !== o.collection_date || prev.collection_time !== o.collection_time || prev.reminder_at !== o.reminder_at)
  }).map(fmt)
  return { added: [...new Set(added)], removed: [...new Set(removed)], changed: [...new Set(changed)] }
}

/** Frase del promemoria (template deterministico, nessuna certezza inventata). */
export function reminderText(occurrence: Pick<ReminderOccurrence, 'fraction_label' | 'collection_date' | 'collection_time' | 'exposure_from' | 'exposure_until'>, tz: string): { title: string; explanation: string } {
  const from = localParts(new Date(occurrence.exposure_from), tz)
  const until = localParts(new Date(occurrence.exposure_until), tz)
  const day = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${occurrence.collection_date}T12:00:00Z`))
  const sameDay = from.date === until.date
  const exposure = sameDay
    ? `Esposizione consentita ${from.date === occurrence.collection_date ? 'il giorno stesso' : `il ${new Intl.DateTimeFormat('it-IT', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${from.date}T12:00:00Z`))}`} dalle ${from.time} alle ${until.time}.`
    : `Esposizione consentita dalle ${from.time} del ${from.date} alle ${until.time} del ${until.date}.`
  return {
    title: `Raccolta ${occurrence.fraction_label.toLowerCase()} · ${day}`,
    explanation: `${day.charAt(0).toUpperCase()}${day.slice(1)} è prevista la raccolta ${occurrence.fraction_label.toLowerCase()} secondo il calendario che hai confermato${occurrence.collection_time ? ` (ore ${occurrence.collection_time})` : ''}. ${exposure}`,
  }
}
