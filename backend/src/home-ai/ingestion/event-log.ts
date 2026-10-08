import { ObservedEventSchema, type ObservedEvent } from '../domain/contracts.js'
import { parse } from '../domain/schema.js'
import { canonicalHash } from '../domain/ids.js'
import { redactAll } from '../domain/redact.js'
import type { Clock } from '../domain/time.js'
import { CoreStore, StorageFailure, json } from '../storage/db.js'

/**
 * Registro eventi append-only + outbox transazionale (specifica §8, §20).
 *
 * - Validazione rigorosa: schema futuro, payload malformato o enorme → quarantena
 *   minimizzata (solo motivo e percorsi degli errori, mai il payload).
 * - Deduplica per identità della fonte: `operation_id + fase` per la
 *   telemetria, id nativo se esiste, altrimenti impronta canonica. Il valore di
 *   stato da solo non è mai una chiave (due gesti possono chiedere lo stesso).
 * - L'evento e la sua voce di outbox nascono nella STESSA transazione: un
 *   crash fra persistenza ed elaborazione non perde nulla (T46).
 */

export const MAX_EVENT_BYTES = 64 * 1_024
export const REORDER_WINDOW_MS = 30_000
/** Quarantena limitata anche in numero: sotto un'ondata di input invalidi restano le voci più recenti (T51). */
export const MAX_QUARANTINE_ROWS = 1_000

export type IngestStatus = 'stored' | 'duplicate' | 'quarantined' | 'degraded' | 'tombstoned'

export interface IngestResult {
  status: IngestStatus
  event_id?: string
  late?: boolean
  reason?: string
}

export function dedupKeyOf(event: ObservedEvent): string {
  switch (event.kind) {
    case 'manual.intent': return `op:${event.payload.operation_id}:intent`
    case 'manual.result': return `op:${event.payload.operation_id}:result`
    default:
      if (event.source.native_id) return `native:${event.kind}:${event.source.native_id}`
      return `fp:${canonicalHash({ kind: event.kind, occurred_at: event.occurred_at, payload: event.payload, delivery: event.delivery })}`
  }
}

export function entitiesOf(event: ObservedEvent): string[] {
  switch (event.kind) {
    case 'manual.intent': return event.payload.target_entity_ids
    case 'state.changed': return [event.payload.entity_id]
    default: return []
  }
}

function operationOf(event: ObservedEvent): string | null {
  if (event.kind === 'manual.intent' || event.kind === 'manual.result') return event.payload.operation_id
  if (event.kind === 'state.changed') return event.payload.effect_of_operation_id
  return null
}

export class EventLog {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  ingest(raw: unknown, opts: { demo: boolean }): IngestResult {
    let size: number
    try { size = Buffer.byteLength(JSON.stringify(raw) ?? '') } catch { size = Infinity }
    if (size > MAX_EVENT_BYTES) return this.quarantine('PAYLOAD_TOO_LARGE', [`${size} byte`])

    if (raw && typeof raw === 'object' && 'schema_version' in raw && (raw as { schema_version: unknown }).schema_version !== 1) {
      return this.quarantine('SCHEMA_UNSUPPORTED', [`schema_version ${String((raw as { schema_version: unknown }).schema_version).slice(0, 12)}`])
    }
    const parsed = parse(ObservedEventSchema, raw)
    if (!parsed.ok) return this.quarantine('SCHEMA_INVALID', parsed.issues.map((issue) => `${issue.path}: ${issue.message}`))
    const event = parsed.value

    const occurred = Date.parse(event.occurred_at)
    const received = Date.parse(event.received_at)
    if (occurred - received > 5 * 60_000) return this.quarantine('CLOCK_SKEW', ['occurred_at nel futuro'])
    if (event.scope.kind === 'person' && !event.scope.subject_id) return this.quarantine('SCOPE_INVALID', ['soggetto mancante'])

    // Il replay riproduce un flusso live registrato: vale la stessa finestra di riordino.
    const late = (event.delivery === 'live' || event.delivery === 'replay') && received - occurred > REORDER_WINDOW_MS
    const dedupKey = dedupKeyOf(event)

    try {
      return this.store.tx(() => {
        const existing = this.store.get('SELECT event_id FROM observed_events WHERE source_id = ? AND dedup_key = ?', event.source.id, dedupKey)
        if (existing) return { status: 'duplicate' as const, event_id: String(existing.event_id) }
        const stored = { ...event, quality: late ? { ...event.quality, reason_codes: [...event.quality.reason_codes, 'LATE_EVENT'].slice(0, 20) } : event.quality }
        this.store.run(
          `INSERT INTO observed_events (event_id, dedup_key, source_id, kind, occurred_at, received_at, delivery,
            scope_kind, subject_id, operation_id, attribution, late, demo, body)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          event.event_id, dedupKey, event.source.id, event.kind, event.occurred_at, event.received_at, event.delivery,
          event.scope.kind, event.scope.subject_id, operationOf(event), event.quality.attribution, late ? 1 : 0, opts.demo ? 1 : 0,
          JSON.stringify(stored),
        )
        for (const entityId of entitiesOf(event)) {
          this.store.run('INSERT OR IGNORE INTO event_entities (event_id, entity_id) VALUES (?, ?)', event.event_id, entityId)
        }
        this.store.run('INSERT INTO outbox (event_id, created_at) VALUES (?, ?)', event.event_id, this.clock.now().toISOString())
        return { status: 'stored' as const, event_id: event.event_id, late }
      })
    } catch (error) {
      if (error instanceof StorageFailure) return { status: 'degraded', reason: error.message }
      // Collisione di event_id con contenuto diverso: è un input non valido.
      if (error instanceof Error && /UNIQUE/i.test(error.message)) return this.quarantine('EVENT_ID_CONFLICT', [])
      throw error
    }
  }

  private quarantine(reason: string, detail: string[]): IngestResult {
    try {
      this.store.run(
        'INSERT INTO quarantine (received_at, reason, detail) VALUES (?, ?, ?)',
        this.clock.now().toISOString(), reason, JSON.stringify(detail.slice(0, 10).map((d) => redactAll(d).slice(0, 160))),
      )
      this.store.run('DELETE FROM quarantine WHERE id <= (SELECT MAX(id) FROM quarantine) - ?', MAX_QUARANTINE_ROWS)
    } catch { /* quarantena best effort */ }
    return { status: 'quarantined', reason }
  }

  /**
   * Consegna almeno-una-volta con checkpoint: handler e avanzamento del
   * checkpoint sono nella stessa transazione, quindi lo stesso messaggio non
   * produce effetti doppi anche dopo un crash (consumer idempotente).
   */
  consume(consumer: string, handler: (event: ObservedEvent, demo: boolean) => void, limit = 200): number {
    const checkpoint = Number(this.store.get('SELECT last_seq FROM consumer_checkpoints WHERE consumer = ?', consumer)?.last_seq ?? 0)
    const rows = this.store.all(
      `SELECT o.seq, e.body, e.demo FROM outbox o JOIN observed_events e ON e.event_id = o.event_id
       WHERE o.seq > ? ORDER BY o.seq LIMIT ?`,
      checkpoint, limit,
    )
    let processed = 0
    for (const row of rows) {
      this.store.tx(() => {
        handler(json<ObservedEvent>(row.body), Number(row.demo) === 1)
        this.store.run(
          `INSERT INTO consumer_checkpoints (consumer, last_seq, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(consumer) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
          consumer, Number(row.seq), this.clock.now().toISOString(),
        )
      })
      processed += 1
    }
    // Voci di outbox orfane (evento cancellato per oblio) fanno avanzare comunque il checkpoint.
    const orphanMax = this.store.get('SELECT MAX(seq) AS s FROM outbox WHERE seq > ? AND event_id NOT IN (SELECT event_id FROM observed_events)', checkpoint)
    if (orphanMax?.s !== null && orphanMax?.s !== undefined && processed === 0) {
      this.store.run(
        `INSERT INTO consumer_checkpoints (consumer, last_seq, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(consumer) DO UPDATE SET last_seq = MAX(last_seq, excluded.last_seq), updated_at = excluded.updated_at`,
        consumer, Number(orphanMax.s), this.clock.now().toISOString(),
      )
    }
    return processed
  }

  pending(consumer: string): number {
    const checkpoint = Number(this.store.get('SELECT last_seq FROM consumer_checkpoints WHERE consumer = ?', consumer)?.last_seq ?? 0)
    return Number(this.store.get('SELECT COUNT(*) AS n FROM outbox WHERE seq > ?', checkpoint)?.n ?? 0)
  }

  /** Compatta l'outbox già consegnata a tutti i consumer registrati. */
  compactOutbox(consumers: string[]): void {
    if (!consumers.length) return
    const rows = consumers.map((consumer) => Number(this.store.get('SELECT last_seq FROM consumer_checkpoints WHERE consumer = ?', consumer)?.last_seq ?? 0))
    const min = Math.min(...rows)
    if (min > 0) this.store.run('DELETE FROM outbox WHERE seq <= ?', min)
  }

  byOperation(operationId: string): ObservedEvent[] {
    return this.store.all('SELECT body FROM observed_events WHERE operation_id = ? ORDER BY occurred_at', operationId)
      .map((row) => json<ObservedEvent>(row.body))
  }

  list(opts: { kinds?: string[]; from?: string; until?: string; limit: number; before?: string; includePersonal: boolean; demo?: boolean }): ObservedEvent[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.kinds?.length) { where.push(`kind IN (${opts.kinds.map(() => '?').join(',')})`); params.push(...opts.kinds) }
    if (opts.from) { where.push('occurred_at >= ?'); params.push(opts.from) }
    if (opts.until) { where.push('occurred_at < ?'); params.push(opts.until) }
    if (opts.before) { where.push('occurred_at < ?'); params.push(opts.before) }
    if (!opts.includePersonal) where.push("scope_kind <> 'person'")
    if (opts.demo !== undefined) { where.push('demo = ?'); params.push(opts.demo ? 1 : 0) }
    const sql = `SELECT body FROM observed_events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at DESC LIMIT ?`
    return this.store.all(sql, ...params, Math.min(opts.limit, 500)).map((row) => json<ObservedEvent>(row.body))
  }

  quarantineCount(): number {
    return Number(this.store.get('SELECT COUNT(*) AS n FROM quarantine')?.n ?? 0)
  }
}
