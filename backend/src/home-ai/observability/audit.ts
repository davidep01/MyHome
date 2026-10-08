import { redactAll } from '../domain/redact.js'
import type { Clock } from '../domain/time.js'
import { CoreStore, json } from '../storage/db.js'

/**
 * Audit minimizzato (specifica §5, §28): chi, cosa, esito e motivi. Nessun
 * payload domestico, nessun segreto (ogni testo passa dalla redazione).
 */

export interface AuditEntry {
  id: number
  at: string
  actor: string
  action: string
  outcome: string
  reason_codes: string[]
  detail: string
}

export class AuditLog {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  record(entry: { actor: string; action: string; outcome: string; reason_codes?: string[]; detail?: string }): void {
    try {
      this.store.run(
        'INSERT INTO audit_entries (at, actor, action, outcome, reason_codes, detail) VALUES (?, ?, ?, ?, ?, ?)',
        this.clock.now().toISOString(),
        redactAll(entry.actor).slice(0, 64),
        redactAll(entry.action).slice(0, 80),
        entry.outcome.slice(0, 32),
        JSON.stringify((entry.reason_codes ?? []).slice(0, 10)),
        redactAll(entry.detail ?? '').slice(0, 200),
      )
    } catch { /* l'audit non deve far fallire l'operazione osservata */ }
  }

  list(limit = 100, before?: number): AuditEntry[] {
    const rows = before
      ? this.store.all('SELECT * FROM audit_entries WHERE id < ? ORDER BY id DESC LIMIT ?', before, Math.min(limit, 500))
      : this.store.all('SELECT * FROM audit_entries ORDER BY id DESC LIMIT ?', Math.min(limit, 500))
    return rows.map((row) => ({
      id: Number(row.id),
      at: String(row.at),
      actor: String(row.actor),
      action: String(row.action),
      outcome: String(row.outcome),
      reason_codes: json<string[]>(row.reason_codes),
      detail: String(row.detail),
    }))
  }
}
