import ical, { type ParameterValue, type VEvent } from 'node-ical'
import type { WasteCalendar, WasteRule } from '../domain/contracts.js'
import { canonicalHash } from '../domain/ids.js'
import { addDays, localParts } from '../domain/time.js'

/**
 * Import di un file ICS locale come BOZZA di calendario (specifica §13).
 *
 * Parser mantenuto (`node-ical`, già nel progetto) per UID, RRULE, EXDATE,
 * RECURRENCE-ID ed eventi cancellati; nessuna espressione regolare sul
 * formato. Le occorrenze vengono espanse nell'orizzonte e salvate come date
 * esplicite: la bozza va verificata nell'anteprima e approvata prima di
 * produrre promemoria. Testi trattati come dati: niente HTML, URL o allegati
 * seguiti (T52).
 */

export const ICS_MAX_BYTES = 2 * 1_024 * 1_024
export const ICS_MAX_OCCURRENCES = 2_000

const FRACTION_KEYWORDS: { id: string; label: string; words: RegExp }[] = [
  { id: 'organico', label: 'Organico', words: /\b(organico|umido|frazione organica|forsu)\b/i },
  { id: 'carta', label: 'Carta', words: /\b(carta|cartone|cartoncino)\b/i },
  { id: 'plastica', label: 'Plastica e metalli', words: /\b(plastica|metalli|multimateriale|lattine)\b/i },
  { id: 'vetro', label: 'Vetro', words: /\bvetro\b/i },
  { id: 'indifferenziato', label: 'Indifferenziato', words: /\b(indifferenziat[oa]|secco|residuo|rsu)\b/i },
]

export interface IcsImportOptions {
  calendar_id: string
  municipality: string
  area: string
  timezone: string
  valid_from: string
  valid_until: string
  /** Mapping esplicito etichetta → frazione, prevale sul riconoscimento per parole chiave. */
  label_mapping: Record<string, string>
  exposure: WasteRule['exposure']
  reminders: WasteRule['reminders']
  acquired_at: string
}

export interface IcsPreview {
  calendar: WasteCalendar | null
  checksum: string
  occurrences: number
  unrecognized_labels: string[]
  errors: string[]
}

function text(value: ParameterValue | string | undefined, max: number): string {
  const raw = typeof value === 'string' ? value : value?.val ?? ''
  // Testo ostile = dato: niente markup, niente controlli, lunghezza limitata.
  return raw.replace(/<[^>]*>/g, '').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function fractionFor(label: string, mapping: Record<string, string>): { id: string; label: string } | null {
  if (mapping[label]) {
    const known = FRACTION_KEYWORDS.find((f) => f.id === mapping[label])
    return { id: mapping[label], label: known?.label ?? label }
  }
  const match = FRACTION_KEYWORDS.find((f) => f.words.test(label))
  return match ? { id: match.id, label: match.label } : null
}

function civilDate(start: Date, allDay: boolean, tz: string): { date: string; time: string | null } {
  if (allDay) {
    // node-ical crea le date intere a mezzanotte LOCALE del processo: si leggono
    // con i getter locali, mai convertendo in UTC (DTEND esclusivo, T27).
    const pad = (n: number) => String(n).padStart(2, '0')
    return { date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, time: null }
  }
  const local = localParts(start, tz)
  return { date: local.date, time: local.time }
}

export function parseWasteIcs(source: string, opts: IcsImportOptions): IcsPreview {
  const checksum = canonicalHash(source)
  const errors: string[] = []
  if (Buffer.byteLength(source) > ICS_MAX_BYTES) return { calendar: null, checksum, occurrences: 0, unrecognized_labels: [], errors: ['File oltre 2 MB.'] }
  let parsed: Record<string, unknown>
  try {
    parsed = ical.sync.parseICS(source) as Record<string, unknown>
  } catch {
    return { calendar: null, checksum, occurrences: 0, unrecognized_labels: [], errors: ['File ICS non leggibile.'] }
  }

  const from = new Date(`${opts.valid_from}T00:00:00Z`)
  const horizonEnd = addDays(opts.valid_from, 60) < opts.valid_until ? addDays(opts.valid_from, 60) : opts.valid_until
  const to = new Date(`${horizonEnd}T23:59:59Z`)
  const byFraction = new Map<string, { label: string; dates: Map<string, string | null> }>()
  const unrecognized = new Set<string>()
  let total = 0

  const add = (summary: string, start: Date, allDay: boolean) => {
    const fraction = fractionFor(summary, opts.label_mapping)
    if (!fraction) { unrecognized.add(summary || '(senza titolo)'); return }
    const { date, time } = civilDate(start, allDay, opts.timezone)
    if (date < opts.valid_from || date > horizonEnd) return
    total += 1
    const entry = byFraction.get(fraction.id) ?? { label: fraction.label, dates: new Map<string, string | null>() }
    entry.dates.set(date, time)
    byFraction.set(fraction.id, entry)
  }

  for (const component of Object.values(parsed)) {
    if (total > ICS_MAX_OCCURRENCES) break
    if (!component || typeof component !== 'object' || (component as { type?: string }).type !== 'VEVENT') continue
    const event = component as VEvent
    if (event.status === 'CANCELLED' || event.recurrenceid) continue
    const summary = text(event.summary, 80)
    // Orario "floating" (né TZID né UTC): node-ical lo legge nella timezone del SERVER e ne
    // espande le ricorrenze in modo diverso a seconda dell'host. Serve una timezone esplicita:
    // errore visibile, mai un orario o un giorno spostato (§13).
    if (event.datetype !== 'date' && event.start && !event.start.dateOnly && !event.start.tz) {
      errors.push(`Orario senza timezone nell’evento “${summary || 'senza titolo'}”: serve un TZID esplicito o una data intera.`)
      continue
    }
    try {
      if (event.rrule) {
        for (const instance of ical.expandRecurringEvent(event, { from, to, includeOverrides: true, excludeExdates: true })) {
          if (instance.event.status === 'CANCELLED') continue
          add(text(instance.event.summary, 80) || summary, instance.start, instance.isFullDay)
          if (total > ICS_MAX_OCCURRENCES) break
        }
      } else {
        add(summary, event.start, event.datetype === 'date' || event.start?.dateOnly === true)
      }
    } catch {
      errors.push(`Ricorrenza non supportata nell’evento “${summary || 'senza titolo'}”.`)
    }
  }
  if (total > ICS_MAX_OCCURRENCES) errors.push(`Oltre ${ICS_MAX_OCCURRENCES} occorrenze: file non importato.`)
  if (errors.length || !byFraction.size) {
    if (!byFraction.size && !errors.length) errors.push('Nessuna raccolta riconosciuta nel file: indica a quale frazione corrisponde ogni etichetta.')
    return { calendar: null, checksum, occurrences: total, unrecognized_labels: [...unrecognized].slice(0, 30), errors }
  }

  const rules: WasteRule[] = [...byFraction.entries()].map(([fractionId, entry]) => {
    const times = new Set(entry.dates.values())
    return {
      rule_id: `ics-${fractionId}`,
      fraction_id: fractionId,
      recurrence: { kind: 'dates', dates: [...entry.dates.keys()].sort().slice(0, 400) },
      // Un orario è riportato solo se coerente per tutte le date: altrimenti "orario non dichiarato".
      collection_time: times.size === 1 ? [...times][0] : null,
      exposure: opts.exposure,
      reminders: opts.reminders,
    }
  })

  const calendar: WasteCalendar = {
    schema_version: 1,
    calendar_id: opts.calendar_id,
    revision: 1,
    municipality: opts.municipality,
    area: opts.area,
    timezone: opts.timezone,
    valid_from: opts.valid_from,
    valid_until: opts.valid_until,
    source: { kind: 'local_ics', reference: `upload:${checksum.slice(0, 16)}`, document_url: null, checksum, acquired_at: opts.acquired_at },
    approval: { state: 'draft', actor_id: null, confirmed_at: null },
    fractions: [...byFraction.entries()].map(([id, entry]) => ({ id, label: entry.label })),
    rules,
    exceptions: [],
    demo: false,
  }
  return { calendar, checksum, occurrences: total, unrecognized_labels: [...unrecognized].slice(0, 30), errors }
}
