import type { ObservedEvent, PrivacyConsent, PrivacyDeletionJob } from '../domain/contracts.js'
import { newId } from '../domain/ids.js'
import { redactAll } from '../domain/redact.js'
import type { Clock } from '../domain/time.js'
import { CoreStore, json } from '../storage/db.js'

/**
 * Privacy: consensi per finalità, export, oblio coerente (specifica §10, §23).
 *
 * - Osservazione, apprendimento e personalizzazione sono consensi distinti:
 *   uno non implica gli altri.
 * - L'oblio rimuove anche i DERIVATI: episodi, pattern, snapshot di contesto,
 *   proposte e indici. Il registro è append-only durante l'ingestione, non
 *   immutabile contro la cancellazione.
 * - Ogni cancellazione lascia una tombstone: un replay o un ripristino da
 *   backup non reimporta ciò che è stato cancellato (T49).
 */

export interface DeletionSelector {
  entity_ids: string[]
  subject_id: string | null
  pattern_id: string | null
  before: string | null
  all: boolean
  /** Solo dati dimostrativi (pulizia della demo). */
  demo_only?: boolean
}

export class PrivacyService {
  constructor(private readonly store: CoreStore, private readonly clock: Clock) {}

  consents(): PrivacyConsent[] {
    return this.store.all('SELECT body FROM privacy_consents ORDER BY rowid DESC LIMIT 100').map((row) => json<PrivacyConsent>(row.body))
  }

  recordConsent(purpose: PrivacyConsent['purpose'], granted: boolean, actor: string): PrivacyConsent {
    const version = Number(this.store.getMeta('privacy_scope_version') ?? 1) + 1
    const consent: PrivacyConsent = {
      consent_id: newId('cns'),
      source_id: 'ha',
      subject_id: null,
      purpose,
      granted,
      granted_by: actor,
      updated_at: this.clock.now().toISOString(),
      scope_version: version,
    }
    this.store.tx(() => {
      this.store.run('INSERT INTO privacy_consents (consent_id, source_id, subject_id, purpose, granted, body) VALUES (?, ?, NULL, ?, ?, ?)',
        consent.consent_id, consent.source_id, purpose, granted ? 1 : 0, JSON.stringify(consent))
      this.store.setMeta('privacy_scope_version', String(version))
    })
    return consent
  }

  /** Export locale dello scope autorizzato, senza segreti. */
  export(opts: { includePersonal: boolean }): Record<string, unknown> {
    // Lo scope personale esce solo con il consenso ai profili: vale per eventi E derivati.
    type Scoped = { scope?: { kind?: string }; subject_id?: string | null }
    // Un rientro del nucleo con `subject_id` identifica comunque una persona (T44).
    const inScope = (item: Scoped) => opts.includePersonal || (item.scope?.kind !== 'person' && !item.subject_id)
    const events = this.store.all('SELECT body FROM observed_events ORDER BY occurred_at DESC LIMIT 5000')
      .map((row) => json<ObservedEvent>(row.body))
      .filter(inScope)
    const payload = {
      exported_at: this.clock.now().toISOString(),
      format: 'home-ai-core-export/v1',
      secrets_included: false,
      events,
      episodes: this.store.all('SELECT body FROM episodes ORDER BY started_at DESC LIMIT 2000').map((row) => json<Scoped>(row.body)).filter(inScope),
      patterns: this.store.all('SELECT body FROM patterns').map((row) => json<Scoped>(row.body)).filter(inScope),
      proposals: this.store.all('SELECT body FROM proposals ORDER BY created_at DESC LIMIT 2000').map((row) => json<Scoped>(row.body)).filter(inScope),
      preferences: this.store.all('SELECT body FROM preferences').map((row) => json<Scoped>(row.body)).filter(inScope),
      feedback: this.store.all('SELECT body FROM feedback').map((row) => json(row.body)),
      waste_calendars: this.store.all('SELECT body FROM waste_calendars').map((row) => json(row.body)),
      reminder_occurrences: this.store.all('SELECT body FROM waste_occurrences').map((row) => json(row.body)),
      consents: this.consents(),
    }
    // Ultima barriera: qualunque segreto finito per errore in un testo viene redatto.
    return JSON.parse(redactAll(JSON.stringify(payload))) as Record<string, unknown>
  }

  requestDeletion(selector: DeletionSelector, actor: string): PrivacyDeletionJob {
    const job: PrivacyDeletionJob = {
      job_id: newId('del'),
      requested_by: actor,
      selector: {
        entity_ids: selector.entity_ids.slice(0, 100),
        subject_id: selector.subject_id,
        pattern_id: selector.pattern_id,
        before: selector.before,
        all: selector.all,
      },
      state: 'pending',
      removed: { events: 0, episodes: 0, patterns: 0, snapshots: 0, proposals: 0, preferences: 0 },
      requested_at: this.clock.now().toISOString(),
      completed_at: null,
    }
    this.store.run('INSERT INTO deletion_jobs (job_id, state, body) VALUES (?, ?, ?)', job.job_id, job.state, JSON.stringify(job))
    return this.run(job, selector, true)
  }

  job(jobId: string): PrivacyDeletionJob | null {
    const row = this.store.get('SELECT body FROM deletion_jobs WHERE job_id = ?', jobId)
    return row ? json<PrivacyDeletionJob>(row.body) : null
  }

  private run(job: PrivacyDeletionJob, selector: DeletionSelector, writeTombstone: boolean): PrivacyDeletionJob {
    const removed = this.purge(selector)
    if (writeTombstone && !selector.demo_only) {
      this.store.run('INSERT INTO deletion_tombstones (selector, created_at) VALUES (?, ?)', JSON.stringify(selector), this.clock.now().toISOString())
    }
    const done: PrivacyDeletionJob = { ...job, state: 'completed', removed, completed_at: this.clock.now().toISOString() }
    this.store.run('UPDATE deletion_jobs SET state = ?, body = ? WHERE job_id = ?', done.state, JSON.stringify(done), job.job_id)
    return done
  }

  /** Cancellazione coerente di eventi e derivati. */
  purge(selector: DeletionSelector): PrivacyDeletionJob['removed'] {
    const removed = { events: 0, episodes: 0, patterns: 0, snapshots: 0, proposals: 0, preferences: 0 }
    this.store.tx(() => {
      const demo = selector.demo_only ? ' AND demo = 1' : ''
      const eventIds = new Set<string>()
      if (selector.all) {
        for (const row of this.store.all(`SELECT event_id FROM observed_events WHERE 1=1${demo}`)) eventIds.add(String(row.event_id))
      }
      for (const entityId of selector.entity_ids) {
        for (const row of this.store.all(`SELECT e.event_id FROM event_entities ee JOIN observed_events e ON e.event_id = ee.event_id WHERE ee.entity_id = ?${demo.replace('demo', 'e.demo')}`, entityId)) eventIds.add(String(row.event_id))
      }
      if (selector.subject_id) {
        for (const row of this.store.all(`SELECT event_id FROM observed_events WHERE subject_id = ?${demo}`, selector.subject_id)) eventIds.add(String(row.event_id))
      }
      if (selector.before) {
        for (const row of this.store.all(`SELECT event_id FROM observed_events WHERE occurred_at < ?${demo}`, selector.before)) eventIds.add(String(row.event_id))
      }

      // Episodi che citano eventi rimossi (o tutti, o del soggetto) → derivati da rigenerare.
      const episodeIds = new Set<string>()
      if (eventIds.size) {
        for (const row of this.store.all('SELECT DISTINCT episode_id FROM episode_events')) {
          const ids = this.store.all('SELECT event_id FROM episode_events WHERE episode_id = ?', String(row.episode_id)).map((r) => String(r.event_id))
          if (ids.some((id) => eventIds.has(id))) episodeIds.add(String(row.episode_id))
        }
      }
      if (selector.all) for (const row of this.store.all(`SELECT episode_id FROM episodes WHERE 1=1${demo}`)) episodeIds.add(String(row.episode_id))
      if (selector.subject_id) for (const row of this.store.all('SELECT episode_id FROM episodes WHERE subject_id = ?', selector.subject_id)) episodeIds.add(String(row.episode_id))
      if (selector.before) for (const row of this.store.all(`SELECT episode_id FROM episodes WHERE started_at < ?${demo}`, selector.before)) episodeIds.add(String(row.episode_id))

      // Pattern che dipendono da quegli episodi, o richiesti esplicitamente.
      const patternIds = new Set<string>()
      if (selector.pattern_id) patternIds.add(selector.pattern_id)
      if (selector.all) for (const row of this.store.all(`SELECT pattern_id FROM patterns WHERE 1=1${demo}`)) patternIds.add(String(row.pattern_id))
      for (const episodeId of episodeIds) {
        for (const row of this.store.all('SELECT pattern_id FROM pattern_evidence WHERE episode_id = ?', episodeId)) patternIds.add(String(row.pattern_id))
      }

      for (const id of eventIds) { this.store.run('DELETE FROM observed_events WHERE event_id = ?', id); removed.events += 1 }
      for (const id of episodeIds) { this.store.run('DELETE FROM episodes WHERE episode_id = ?', id); removed.episodes += 1 }
      for (const id of patternIds) {
        this.store.run('DELETE FROM patterns WHERE pattern_id = ?', id)
        removed.patterns += 1
        for (const row of this.store.all("SELECT proposal_id FROM proposals WHERE json_extract(body, '$.pattern_id') = ?", id)) {
          this.store.run('DELETE FROM proposals WHERE proposal_id = ?', String(row.proposal_id)); removed.proposals += 1
        }
        const prefs = this.store.all("SELECT preference_id FROM preferences WHERE json_extract(body, '$.pattern_id') = ? AND kind = 'routine'", id)
        for (const row of prefs) { this.store.run('DELETE FROM preferences WHERE preference_id = ?', String(row.preference_id)); removed.preferences += 1 }
        this.store.run("DELETE FROM feedback WHERE target_kind = 'pattern' AND target_id = ?", id)
      }

      // Snapshot di contesto che contengono le entità o derivano dal soggetto/periodo.
      for (const entityId of selector.entity_ids) {
        const rows = this.store.all('SELECT snapshot_id FROM context_snapshots WHERE body LIKE ?', `%"${entityId}"%`)
        for (const row of rows) { this.store.run('DELETE FROM context_snapshots WHERE snapshot_id = ?', String(row.snapshot_id)); removed.snapshots += 1 }
        this.store.run('DELETE FROM entity_state WHERE entity_id = ?', entityId)
        for (const row of this.store.all('SELECT proposal_id FROM proposals WHERE body LIKE ?', `%"${entityId}"%`)) {
          this.store.run('DELETE FROM proposals WHERE proposal_id = ?', String(row.proposal_id)); removed.proposals += 1
        }
      }
      if (selector.before) {
        for (const row of this.store.all('SELECT snapshot_id FROM context_snapshots WHERE taken_at < ?', selector.before)) {
          this.store.run('DELETE FROM context_snapshots WHERE snapshot_id = ?', String(row.snapshot_id)); removed.snapshots += 1
        }
      }
      if (selector.all) {
        const snapshots = this.store.all(`SELECT snapshot_id FROM context_snapshots`)
        for (const row of snapshots) { this.store.run('DELETE FROM context_snapshots WHERE snapshot_id = ?', String(row.snapshot_id)); removed.snapshots += 1 }
        for (const row of this.store.all(`SELECT proposal_id FROM proposals WHERE 1=1${demo}`)) {
          this.store.run('DELETE FROM proposals WHERE proposal_id = ?', String(row.proposal_id)); removed.proposals += 1
        }
        this.store.run(`DELETE FROM entity_state WHERE 1=1${demo}`)
        if (!selector.demo_only) this.store.run('DELETE FROM coverage_intervals')
      }
    })
    return removed
  }

  /** true se l'evento rientra in una cancellazione già richiesta (replay/ripristino non lo reimportano). */
  isTombstoned(event: ObservedEvent): boolean {
    const tombstones = this.tombstones()
    if (!tombstones.length) return false
    const entities = event.kind === 'manual.intent' ? event.payload.target_entity_ids : event.kind === 'state.changed' ? [event.payload.entity_id] : []
    // Si blocca ciò che esisteva PRIMA della cancellazione: un replay o un
    // ripristino non lo reimporta; i nuovi eventi dopo l'oblio restano ammessi.
    return tombstones.some((t) => {
      if (event.occurred_at >= t.created_at) return false
      if (t.all) return !t.demo_only
      if (t.before && event.occurred_at < t.before) return true
      if (t.subject_id && event.scope.subject_id === t.subject_id) return true
      return t.entity_ids.length > 0 && entities.some((id) => t.entity_ids.includes(id))
    })
  }

  tombstones(): (DeletionSelector & { created_at: string })[] {
    return this.store.all('SELECT selector, created_at FROM deletion_tombstones ORDER BY id').map((row) => ({
      ...json<DeletionSelector>(row.selector),
      created_at: String(row.created_at),
    }))
  }

  /** Dopo un ripristino: riapplica le cancellazioni prima di riattivare l'elaborazione. */
  reapplyTombstones(tombstones: (DeletionSelector & { created_at: string })[]): number {
    let removed = 0
    for (const tombstone of tombstones) {
      const { created_at, ...selector } = tombstone
      const result = this.purge(selector)
      removed += result.events + result.episodes + result.patterns
      const exists = this.store.get('SELECT id FROM deletion_tombstones WHERE selector = ? AND created_at = ?', JSON.stringify(selector), created_at)
      if (!exists) this.store.run('INSERT INTO deletion_tombstones (selector, created_at) VALUES (?, ?)', JSON.stringify(selector), created_at)
    }
    return removed
  }

  /** Retention: eventi, episodi, audit e quarantena oltre i limiti configurati. */
  applyRetention(days: { events: number; episodes: number; statistics: number; audit: number; quarantine: number }): Record<string, number> {
    const now = this.clock.now().getTime()
    const cutoff = (d: number) => new Date(now - d * 86_400_000).toISOString()
    const counts: Record<string, number> = {}
    this.store.tx(() => {
      counts.events = Number(this.store.get('SELECT COUNT(*) AS n FROM observed_events WHERE occurred_at < ?', cutoff(days.events))?.n ?? 0)
      this.store.run('DELETE FROM observed_events WHERE occurred_at < ?', cutoff(days.events))
      counts.episodes = Number(this.store.get('SELECT COUNT(*) AS n FROM episodes WHERE started_at < ?', cutoff(days.episodes))?.n ?? 0)
      this.store.run('DELETE FROM episodes WHERE started_at < ?', cutoff(days.episodes))
      this.store.run('DELETE FROM audit_entries WHERE at < ?', cutoff(days.audit))
      this.store.run('DELETE FROM quarantine WHERE received_at < ?', cutoff(days.quarantine))
      this.store.run('DELETE FROM context_snapshots WHERE taken_at < ?', cutoff(days.statistics))
      this.store.run('DELETE FROM policy_decisions WHERE evaluated_at < ?', cutoff(days.audit))
      this.store.run('DELETE FROM idempotency WHERE created_at < ?', cutoff(2))
    })
    return counts
  }

  redactForLog(text: string): string { return redactAll(text) }
}
