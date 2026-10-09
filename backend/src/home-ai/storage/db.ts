import type { DatabaseSync, SQLValue } from 'node:sqlite'

/**
 * Archivio locale del core: SQLite (modulo integrato `node:sqlite`), WAL,
 * foreign key, un solo processo scrittore (il backend MyHome).
 *
 * È separato dal `db.json` della dashboard di proposito: la dashboard e i
 * comandi manuali non devono dipendere dal successo di questo database
 * (specifica §20), e il blob JSON della dashboard non va appesantito con
 * eventi ed episodi.
 */

export type Row = Record<string, SQLValue>

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE settings (key TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);

      CREATE TABLE observed_events (
        event_id TEXT PRIMARY KEY,
        dedup_key TEXT NOT NULL,
        source_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        delivery TEXT NOT NULL,
        scope_kind TEXT NOT NULL,
        subject_id TEXT,
        operation_id TEXT,
        attribution TEXT NOT NULL,
        late INTEGER NOT NULL DEFAULT 0,
        demo INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL,
        UNIQUE (source_id, dedup_key)
      );
      CREATE INDEX idx_events_occurred ON observed_events (occurred_at);
      CREATE INDEX idx_events_kind ON observed_events (kind, occurred_at);
      CREATE INDEX idx_events_operation ON observed_events (operation_id);
      CREATE INDEX idx_events_subject ON observed_events (subject_id);
      CREATE TABLE event_entities (
        event_id TEXT NOT NULL REFERENCES observed_events(event_id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        PRIMARY KEY (event_id, entity_id)
      );
      CREATE INDEX idx_event_entities_entity ON event_entities (entity_id);

      CREATE TABLE outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE consumer_checkpoints (consumer TEXT PRIMARY KEY, last_seq INTEGER NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE quarantine (id INTEGER PRIMARY KEY AUTOINCREMENT, received_at TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL);

      CREATE TABLE entity_catalog (
        entity_id TEXT PRIMARY KEY, domain TEXT NOT NULL, label TEXT NOT NULL, area_id TEXT,
        capabilities TEXT NOT NULL, role TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE entity_relations (
        from_id TEXT NOT NULL, relation TEXT NOT NULL, to_id TEXT NOT NULL,
        origin TEXT NOT NULL, confidence REAL NOT NULL, PRIMARY KEY (from_id, relation, to_id)
      );
      CREATE TABLE entity_state (
        entity_id TEXT PRIMARY KEY, value TEXT NOT NULL, source_updated_at TEXT, received_at TEXT NOT NULL,
        conflict INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE coverage_intervals (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, from_at TEXT NOT NULL, until_at TEXT, reason TEXT NOT NULL
      );
      CREATE INDEX idx_coverage_from ON coverage_intervals (from_at);
      CREATE TABLE context_snapshots (snapshot_id TEXT PRIMARY KEY, taken_at TEXT NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL);

      CREATE TABLE episodes (
        episode_id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, subject_id TEXT,
        local_date TEXT NOT NULL, started_at TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_episodes_started ON episodes (kind, started_at);
      CREATE TABLE episode_events (
        episode_id TEXT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
        event_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (episode_id, event_id)
      );

      CREATE TABLE patterns (
        pattern_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, subject_id TEXT,
        demo INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE pattern_evidence (
        pattern_id TEXT NOT NULL REFERENCES patterns(pattern_id) ON DELETE CASCADE,
        episode_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (pattern_id, episode_id)
      );

      CREATE TABLE preferences (
        preference_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, kind TEXT NOT NULL, topic TEXT NOT NULL,
        body TEXT NOT NULL, revoked_at TEXT
      );
      CREATE TABLE feedback (
        feedback_id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL,
        body TEXT NOT NULL, created_at TEXT NOT NULL
      );

      CREATE TABLE waste_calendars (
        calendar_id TEXT NOT NULL, revision INTEGER NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (calendar_id, revision)
      );
      CREATE TABLE waste_occurrences (
        occurrence_id TEXT PRIMARY KEY, calendar_id TEXT NOT NULL, calendar_revision INTEGER NOT NULL,
        state TEXT NOT NULL, reminder_at TEXT NOT NULL, body TEXT NOT NULL
      );
      CREATE INDEX idx_occurrences_reminder ON waste_occurrences (state, reminder_at);

      CREATE TABLE proposals (
        proposal_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, topic TEXT NOT NULL,
        agent_key TEXT NOT NULL, dedup_key TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        demo INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL
      );
      CREATE INDEX idx_proposals_state ON proposals (state, created_at);
      CREATE UNIQUE INDEX idx_proposals_dedup ON proposals (dedup_key);
      CREATE TABLE approvals (
        approval_id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, proposal_revision INTEGER NOT NULL,
        plan_hash TEXT NOT NULL, purpose TEXT NOT NULL, body TEXT NOT NULL, revoked_at TEXT,
        UNIQUE (proposal_id, proposal_revision, purpose)
      );
      CREATE TABLE simulation_reports (report_id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE policy_decisions (decision_id TEXT PRIMARY KEY, candidate_key TEXT NOT NULL, evaluated_at TEXT NOT NULL, body TEXT NOT NULL);

      CREATE TABLE privacy_consents (
        consent_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, subject_id TEXT, purpose TEXT NOT NULL,
        granted INTEGER NOT NULL, body TEXT NOT NULL
      );
      CREATE TABLE deletion_jobs (job_id TEXT PRIMARY KEY, state TEXT NOT NULL, body TEXT NOT NULL);
      CREATE TABLE deletion_tombstones (id INTEGER PRIMARY KEY AUTOINCREMENT, selector TEXT NOT NULL, created_at TEXT NOT NULL);

      CREATE TABLE audit_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
        outcome TEXT NOT NULL, reason_codes TEXT NOT NULL, detail TEXT NOT NULL
      );
      CREATE INDEX idx_audit_at ON audit_entries (at);
      CREATE TABLE scheduled_jobs (job_key TEXT PRIMARY KEY, kind TEXT NOT NULL, due_at TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX idx_jobs_due ON scheduled_jobs (state, due_at);
      CREATE TABLE idempotency (key TEXT PRIMARY KEY, route TEXT NOT NULL, status INTEGER NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE backups (id TEXT PRIMARY KEY, file TEXT NOT NULL, created_at TEXT NOT NULL, verified_at TEXT, restored_at TEXT);
    `,
  },
  {
    // Manuale della casa: solo le note scritte dall'utente; i fatti generati si ricalcolano dallo stato.
    version: 2,
    sql: `
      CREATE TABLE knowledge_notes (
        note_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, subject_id TEXT, demo INTEGER NOT NULL DEFAULT 0,
        body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_knowledge_notes_subject ON knowledge_notes (subject_id);
    `,
  },
]

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

export class StorageFailure extends Error {
  constructor(message: string) { super(message); this.name = 'StorageFailure' }
}

export class CoreStore {
  readonly db: DatabaseSync
  readonly path: string
  private degradedReason: string | null = null

  constructor(db: DatabaseSync, path: string) {
    this.db = db
    this.path = path
    db.exec('PRAGMA foreign_keys = ON')
    if (path !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA synchronous = NORMAL')
    }
    db.exec('PRAGMA busy_timeout = 2000')
    this.migrate()
  }

  get degraded(): string | null { return this.degradedReason }

  private migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    const row = this.db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()
    const current = Number(row?.v ?? 0)
    if (current > CURRENT_SCHEMA_VERSION) {
      // Un database scritto da una release futura non viene reinterpretato.
      throw new StorageFailure(`archivio di versione ${current} più recente di questa release (${CURRENT_SCHEMA_VERSION})`)
    }
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue
      this.tx(() => {
        this.db.exec(migration.sql)
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString())
      })
    }
  }

  /** Transazione sincrona: tutto o niente. Su disco pieno il core si dichiara degradato. */
  tx<T>(fn: () => T): T {
    // Anche BEGIN può fallire su un archivio non scrivibile: stesso degrado esplicito.
    try { this.db.exec('BEGIN IMMEDIATE') } catch (error) { throw this.storageError(error) }
    try {
      const out = fn()
      this.db.exec('COMMIT')
      if (this.degradedReason?.startsWith('scrittura')) this.degradedReason = null
      return out
    } catch (error) {
      try { this.db.exec('ROLLBACK') } catch { /* già annullata */ }
      throw this.storageError(error)
    }
  }

  /** Disco pieno / archivio non scrivibile → stato degradato + `StorageFailure`; il resto passa invariato. */
  private storageError(error: unknown): unknown {
    const message = error instanceof Error ? error.message : String(error)
    if (/SQLITE_FULL|database or disk is full|readonly|SQLITE_IOERR|SQLITE_CANTOPEN/i.test(message)) {
      this.degradedReason = 'scrittura non riuscita: archivio pieno o non scrivibile'
      return new StorageFailure(this.degradedReason)
    }
    return error
  }

  run(sql: string, ...params: SQLValue[]): void {
    try { this.db.prepare(sql).run(...params) } catch (error) { throw this.storageError(error) }
  }
  get(sql: string, ...params: SQLValue[]): Row | undefined { return this.db.prepare(sql).get(...params) }
  all(sql: string, ...params: SQLValue[]): Row[] { return this.db.prepare(sql).all(...params) }

  /** Solo per test di guasto: simula un archivio non scrivibile. */
  markDegraded(reason: string): void { this.degradedReason = reason }

  getMeta(key: string): string | null {
    const row = this.get('SELECT value FROM meta WHERE key = ?', key)
    return row ? String(row.value) : null
  }

  setMeta(key: string, value: string): void {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  close(): void { if (this.db.isOpen) this.db.close() }
}

export function json<T>(value: SQLValue | undefined): T {
  return JSON.parse(String(value)) as T
}

/**
 * `node:sqlite` esiste solo col prefisso `node:`: lo specificatore è costruito a
 * runtime perché il bundler non lo riscriva in `sqlite` (modulo inesistente).
 */
export async function loadSqlite(): Promise<typeof import('node:sqlite')> {
  const specifier = ['node', 'sqlite'].join(':')
  return await import(specifier) as typeof import('node:sqlite')
}

export async function openCoreStore(path: string): Promise<CoreStore> {
  const sqlite = await loadSqlite()
  return new CoreStore(new sqlite.DatabaseSync(path), path)
}
