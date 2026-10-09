import { WasteCalendarSchema, type ReminderOccurrence, type WasteCalendar } from '../domain/contracts.js'
import { CoreError } from '../domain/errors.js'
import { parse } from '../domain/schema.js'
import { localParts, type Clock } from '../domain/time.js'
import { CoreStore, json } from '../storage/db.js'
import { diffResolutions, resolveOccurrences, type CalendarIssue, type ResolvedOccurrence } from './calendar.js'

/**
 * Calendari versionati, approvazione e ciclo di vita dei promemoria (§13).
 *
 *   scheduled → due → visible → snoozed | completed | dismissed | expired | superseded
 *
 * - Ogni revisione nasce bozza; si approva dopo l'anteprima delle differenze.
 *   Approvare due volte la stessa revisione non attiva nulla due volte (T28).
 * - Una nuova versione approvata ritira i promemoria della precedente e
 *   riconcilia quelli validi, conservando "fatto"/"ignorato" (T24).
 * - Al riavvio i promemoria maturati si recuperano una volta sola; quelli la
 *   cui finestra utile è passata scadono, senza raffiche retroattive (T47).
 * - `completed` = l'utente dichiara di aver esposto i rifiuti, non che il
 *   gestore abbia raccolto.
 */

export interface StoredOccurrence extends ReminderOccurrence { natural_key: string; demo: boolean }

function sameSchedule(a: ResolvedOccurrence, b: ResolvedOccurrence): boolean {
  return a.collection_date === b.collection_date && a.collection_time === b.collection_time
    && a.exposure_from === b.exposure_from && a.exposure_until === b.exposure_until
    && a.reminder_at === b.reminder_at && a.fraction_label === b.fraction_label
}

export class WasteService {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  /** Salva una nuova revisione in BOZZA. Il calendario approvato resta attivo finché non si approva questa. */
  saveDraft(input: unknown, opts: { tz: string; horizonDays: number; realHome: boolean }): { calendar: WasteCalendar; preview: ReturnType<WasteService['preview']> } {
    const parsed = parse(WasteCalendarSchema, input)
    if (!parsed.ok) throw new CoreError('VALIDATION_ERROR', 'Calendario non valido.', parsed.issues.map((i) => `${i.path}: ${i.message}`))
    const latest = this.latestRevision(parsed.value.calendar_id)
    const calendar: WasteCalendar = {
      ...parsed.value,
      revision: (latest?.revision ?? 0) + 1,
      approval: { state: 'draft', actor_id: null, confirmed_at: null },
    }
    this.store.run(
      'INSERT INTO waste_calendars (calendar_id, revision, state, body, created_at) VALUES (?, ?, ?, ?, ?)',
      calendar.calendar_id, calendar.revision, 'draft', JSON.stringify(calendar), this.clock.now().toISOString(),
    )
    return { calendar, preview: this.preview(calendar, opts) }
  }

  preview(calendar: WasteCalendar, opts: { tz: string; horizonDays: number; realHome: boolean }) {
    const today = localParts(this.clock.now(), opts.tz).date
    const next = resolveOccurrences({ ...calendar, approval: { ...calendar.approval, state: 'approved' } }, { today, horizonDays: opts.horizonDays, realHome: opts.realHome })
    const active = this.active(calendar.calendar_id)
    const previous = active ? resolveOccurrences(active, { today, horizonDays: opts.horizonDays, realHome: opts.realHome }).occurrences : []
    return {
      occurrences: next.occurrences.slice(0, 120),
      issues: next.issues,
      diff: diffResolutions(previous, next.occurrences),
      dst_adjusted: next.occurrences.filter((o) => o.time_resolution !== 'exact').map((o) => ({ date: o.collection_date, resolution: o.time_resolution })),
    }
  }

  approve(calendarId: string, revision: number, actorId: string, opts: { tz: string; horizonDays: number; realHome: boolean; demo: boolean }): WasteCalendar {
    const row = this.store.get('SELECT state, body FROM waste_calendars WHERE calendar_id = ? AND revision = ?', calendarId, revision)
    if (!row) throw new CoreError('NOT_FOUND', 'Revisione del calendario non trovata.')
    const calendar = json<WasteCalendar>(row.body)
    if (String(row.state) === 'approved') return calendar // idempotente (T28)
    const latest = this.latestRevision(calendarId)
    if (latest && latest.revision !== revision) throw new CoreError('REVISION_CONFLICT', 'Esiste una revisione più recente: verifica quella.')
    const now = this.clock.now().toISOString()
    const approved: WasteCalendar = { ...calendar, approval: { state: 'approved', actor_id: actorId, confirmed_at: now } }
    this.store.tx(() => {
      this.store.run("UPDATE waste_calendars SET state = 'superseded' WHERE calendar_id = ? AND state = 'approved'", calendarId)
      this.store.run('UPDATE waste_calendars SET state = ?, body = ? WHERE calendar_id = ? AND revision = ?', 'approved', JSON.stringify(approved), calendarId, revision)
    })
    this.reconcile(opts)
    return approved
  }

  active(calendarId?: string): WasteCalendar | null {
    const row = calendarId
      ? this.store.get("SELECT body FROM waste_calendars WHERE calendar_id = ? AND state = 'approved' ORDER BY revision DESC LIMIT 1", calendarId)
      : this.store.get("SELECT body FROM waste_calendars WHERE state = 'approved' ORDER BY created_at DESC LIMIT 1")
    return row ? json<WasteCalendar>(row.body) : null
  }

  latestRevision(calendarId: string): WasteCalendar | null {
    const row = this.store.get('SELECT body FROM waste_calendars WHERE calendar_id = ? ORDER BY revision DESC LIMIT 1', calendarId)
    return row ? json<WasteCalendar>(row.body) : null
  }

  revisions(): { calendar_id: string; revision: number; state: string; created_at: string; demo: boolean }[] {
    return this.store.all('SELECT calendar_id, revision, state, created_at, body FROM waste_calendars ORDER BY created_at DESC LIMIT 50').map((row) => ({
      calendar_id: String(row.calendar_id),
      revision: Number(row.revision),
      state: String(row.state),
      created_at: String(row.created_at),
      demo: json<WasteCalendar>(row.body).demo,
    }))
  }

  /** Allinea le occorrenze alla versione approvata; deduplica per chiave naturale. */
  reconcile(opts: { tz: string; horizonDays: number; realHome: boolean }): { issues: CalendarIssue[] } {
    const calendar = this.active()
    const now = this.clock.now()
    const nowIso = now.toISOString()
    if (!calendar) return { issues: [{ code: 'CALENDAR_NOT_CONFIGURED', message: 'Nessun calendario della raccolta approvato.' }] }
    const today = localParts(now, opts.tz).date
    const resolution = resolveOccurrences(calendar, { today, horizonDays: opts.horizonDays, realHome: opts.realHome })
    const existing = this.store.all("SELECT body FROM waste_occurrences WHERE state NOT IN ('superseded')").map((row) => json<StoredOccurrence>(row.body))
    const byKey = new Map(existing.map((o) => [o.natural_key, o]))
    const nextKeys = new Set<string>()

    this.store.tx(() => {
      // Fonte non verificabile: niente promemoria certi, si ritirano quelli in sospeso.
      const occurrences: ResolvedOccurrence[] = resolution.certain ? resolution.occurrences : []
      for (const occurrence of occurrences) {
        nextKeys.add(occurrence.natural_key)
        const prev = byKey.get(occurrence.natural_key)
        // Una revisione che non cambia raccolta, finestra e promemoria lascia l'occorrenza com'è:
        // niente promemoria ripetuto, snooze e stato restano (T24, T28).
        if (prev && (prev.occurrence_id === occurrence.occurrence_id || sameSchedule(prev, occurrence))) continue
        const carried = prev && ['completed', 'dismissed'].includes(prev.state) ? prev.state : 'scheduled'
        if (prev) this.setState(prev, 'superseded', nowIso)
        const stored: StoredOccurrence = { ...occurrence, state: carried, snoozed_until: null, updated_at: nowIso, demo: calendar.demo }
        this.store.run(
          `INSERT INTO waste_occurrences (occurrence_id, calendar_id, calendar_revision, state, reminder_at, body) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(occurrence_id) DO NOTHING`,
          stored.occurrence_id, stored.calendar_id, stored.calendar_revision, stored.state, stored.reminder_at, JSON.stringify(stored),
        )
      }
      for (const prev of existing) {
        if (nextKeys.has(prev.natural_key)) continue
        if (['scheduled', 'due', 'visible', 'snoozed'].includes(prev.state) && Date.parse(prev.exposure_until) > now.getTime()) {
          this.setState(prev, 'superseded', nowIso)
        }
      }
    })
    return { issues: resolution.issues }
  }

  /** Avanza il ciclo di vita in base all'orologio; restituisce le occorrenze appena maturate. */
  tick(): StoredOccurrence[] {
    const now = this.clock.now()
    const nowIso = now.toISOString()
    const matured: StoredOccurrence[] = []
    const rows = this.store.all("SELECT body FROM waste_occurrences WHERE state IN ('scheduled', 'due', 'visible', 'snoozed')")
    this.store.tx(() => {
      for (const row of rows) {
        const occurrence = json<StoredOccurrence>(row.body)
        if (now.getTime() >= Date.parse(occurrence.exposure_until)) {
          this.setState(occurrence, 'expired', nowIso)
          continue
        }
        if (occurrence.state === 'scheduled' && now.getTime() >= Date.parse(occurrence.reminder_at)) {
          matured.push(this.setState(occurrence, 'due', nowIso))
        } else if (occurrence.state === 'snoozed' && occurrence.snoozed_until && now.getTime() >= Date.parse(occurrence.snoozed_until)) {
          matured.push(this.setState({ ...occurrence, snoozed_until: null }, 'due', nowIso))
        }
      }
    })
    return matured
  }

  markVisible(occurrenceId: string): void {
    const occurrence = this.get(occurrenceId)
    if (occurrence && occurrence.state === 'due') this.setState(occurrence, 'visible', this.clock.now().toISOString())
  }

  feedback(occurrenceId: string, kind: 'done' | 'dismiss' | 'snooze', snoozeMinutes = 60): { occurrence: StoredOccurrence; capped: boolean } {
    const occurrence = this.get(occurrenceId)
    if (!occurrence) throw new CoreError('NOT_FOUND', 'Promemoria non trovato.')
    const nowIso = this.clock.now().toISOString()
    if (['completed', 'dismissed', 'expired', 'superseded'].includes(occurrence.state)) return { occurrence, capped: false }
    if (kind === 'done') return { occurrence: this.setState(occurrence, 'completed', nowIso), capped: false }
    if (kind === 'dismiss') return { occurrence: this.setState(occurrence, 'dismissed', nowIso), capped: false }
    // Lo snooze non supera la scadenza utile: si ferma all'ultimo momento valido e lo dice.
    const wanted = this.clock.now().getTime() + Math.max(5, Math.min(snoozeMinutes, 24 * 60)) * 60_000
    const limit = Date.parse(occurrence.exposure_until) - 5 * 60_000
    const capped = wanted > limit
    return { occurrence: this.setState({ ...occurrence, snoozed_until: new Date(Math.min(wanted, limit)).toISOString() }, 'snoozed', nowIso), capped }
  }

  get(occurrenceId: string): StoredOccurrence | null {
    const row = this.store.get('SELECT body FROM waste_occurrences WHERE occurrence_id = ?', occurrenceId)
    return row ? json<StoredOccurrence>(row.body) : null
  }

  upcoming(limit = 20): StoredOccurrence[] {
    return this.store.all("SELECT body FROM waste_occurrences WHERE state NOT IN ('superseded') ORDER BY reminder_at LIMIT ?", limit)
      .map((row) => json<StoredOccurrence>(row.body))
      .filter((o) => Date.parse(o.exposure_until) > this.clock.now().getTime() - 86_400_000)
  }

  private setState(occurrence: StoredOccurrence, state: StoredOccurrence['state'], at: string): StoredOccurrence {
    const next = { ...occurrence, state, updated_at: at }
    this.store.run('UPDATE waste_occurrences SET state = ?, body = ? WHERE occurrence_id = ?', state, JSON.stringify(next), occurrence.occurrence_id)
    return next
  }
}
