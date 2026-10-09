import type { ObservedEvent, StateValue } from '../domain/contracts.js'
import { CoreStore, json } from '../storage/db.js'

/**
 * Proiezione dello stato corrente + intervalli di copertura (specifica §8).
 *
 * - L'ordine affidabile è `source_updated_at`: un aggiornamento più vecchio
 *   non sovrascrive uno più nuovo arrivato prima (eventi riordinati, T10).
 * - A parità di timestamp con valori diversi si marca il conflitto invece di
 *   scegliere arbitrariamente.
 * - `unknown`/`unavailable` restano tali: non diventano "spento" o "chiuso".
 */

export interface ProjectedState {
  entity_id: string
  value: StateValue
  received_at: string
  conflict: boolean
  demo: boolean
}

export class StateProjection {
  constructor(private readonly store: CoreStore) {}

  apply(event: ObservedEvent, demo: boolean): void {
    if (event.kind === 'state.changed') {
      const { entity_id, after } = event.payload
      if (!after) {
        this.store.run('DELETE FROM entity_state WHERE entity_id = ?', entity_id)
        return
      }
      const current = this.store.get('SELECT value, source_updated_at FROM entity_state WHERE entity_id = ?', entity_id)
      const incomingAt = after.source_updated_at ?? event.occurred_at
      if (current) {
        const currentAt = current.source_updated_at ? String(current.source_updated_at) : null
        if (currentAt && incomingAt < currentAt) return
        if (currentAt && incomingAt === currentAt) {
          const value = json<StateValue>(current.value)
          if (value.state !== after.state) {
            this.store.run('UPDATE entity_state SET conflict = 1 WHERE entity_id = ?', entity_id)
          }
          return
        }
      }
      this.store.run(
        `INSERT INTO entity_state (entity_id, value, source_updated_at, received_at, conflict, demo) VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(entity_id) DO UPDATE SET value = excluded.value, source_updated_at = excluded.source_updated_at,
           received_at = excluded.received_at, conflict = 0, demo = excluded.demo`,
        entity_id, JSON.stringify(after), incomingAt, event.received_at, demo ? 1 : 0,
      )
    } else if (event.kind === 'coverage.gap') {
      const { source_id, from, until, reason_code } = event.payload
      if (until) {
        const open = this.store.get('SELECT id FROM coverage_intervals WHERE source_id = ? AND until_at IS NULL ORDER BY from_at DESC LIMIT 1', source_id)
        if (open) this.store.run('UPDATE coverage_intervals SET until_at = ? WHERE id = ?', until, Number(open.id))
        else this.store.run('INSERT INTO coverage_intervals (source_id, from_at, until_at, reason) VALUES (?, ?, ?, ?)', source_id, from, until, reason_code)
      } else {
        const open = this.store.get('SELECT id FROM coverage_intervals WHERE source_id = ? AND until_at IS NULL', source_id)
        if (!open) this.store.run('INSERT INTO coverage_intervals (source_id, from_at, until_at, reason) VALUES (?, ?, NULL, ?)', source_id, from, reason_code)
      }
    }
  }

  get(entityId: string): ProjectedState | null {
    const row = this.store.get('SELECT * FROM entity_state WHERE entity_id = ?', entityId)
    return row ? this.toState(row) : null
  }

  all(): ProjectedState[] {
    return this.store.all('SELECT * FROM entity_state ORDER BY entity_id').map((row) => this.toState(row))
  }

  private toState(row: Record<string, unknown>): ProjectedState {
    return {
      entity_id: String(row.entity_id),
      value: JSON.parse(String(row.value)) as StateValue,
      received_at: String(row.received_at),
      conflict: Number(row.conflict) === 1,
      demo: Number(row.demo) === 1,
    }
  }

  /** Intervalli di copertura incompleta che si sovrappongono a [from, until). */
  gapsOverlapping(from: string, until: string): { source_id: string; from_at: string; until_at: string | null; reason: string }[] {
    return this.store.all(
      `SELECT source_id, from_at, until_at, reason FROM coverage_intervals
       WHERE from_at < ? AND (until_at IS NULL OR until_at > ?)`,
      until, from,
    ).map((row) => ({
      source_id: String(row.source_id),
      from_at: String(row.from_at),
      until_at: row.until_at === null ? null : String(row.until_at),
      reason: String(row.reason),
    }))
  }

  openGaps(): { source_id: string; from: string; reason_code: string }[] {
    return this.store.all('SELECT source_id, from_at, reason FROM coverage_intervals WHERE until_at IS NULL ORDER BY from_at DESC LIMIT 50')
      .map((row) => ({ source_id: String(row.source_id), from: String(row.from_at), reason_code: String(row.reason) }))
  }
}
