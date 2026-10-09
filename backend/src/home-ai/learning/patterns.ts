import type { EventOf, HabitPattern } from '../domain/contracts.js'
import { localParts, daypartOf, type Clock } from '../domain/time.js'
import type { CoreConfig } from '../config.js'
import { CoreStore, json } from '../storage/db.js'
import type { ArrivalTracker, StoredEpisode } from '../episodes/arrival.js'
import { actionToken } from '../episodes/arrival.js'
import { mineArrivalPatterns, type MinedPattern } from './miner.js'

/**
 * Repository dei pattern: esegue il miner (job incrementale/batch limitato),
 * conserva ipotesi, evidenze e motivi di ogni cambio di stato. Le preferenze
 * esplicite e i feedback prevalgono sempre sulle inferenze.
 */

export interface StoredPattern extends HabitPattern {
  demo: boolean
  tokens: string[]
  labels: string[]
}

export class PatternRepository {
  constructor(
    private readonly store: CoreStore,
    private readonly episodes: ArrivalTracker,
    private readonly clock: Clock,
  ) {}

  list(opts: { demo?: boolean; includeRetired?: boolean } = {}): StoredPattern[] {
    const where: string[] = []
    const params: (string | number)[] = []
    if (opts.demo !== undefined) { where.push('demo = ?'); params.push(opts.demo ? 1 : 0) }
    if (!opts.includeRetired) where.push("state <> 'retired'")
    return this.store.all(`SELECT body FROM patterns ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 200`, ...params)
      .map((row) => json<StoredPattern>(row.body))
  }

  get(patternId: string): StoredPattern | null {
    const row = this.store.get('SELECT body FROM patterns WHERE pattern_id = ?', patternId)
    return row ? json<StoredPattern>(row.body) : null
  }

  evidence(patternId: string): { episode_id: string; role: string }[] {
    return this.store.all('SELECT episode_id, role FROM pattern_evidence WHERE pattern_id = ?', patternId)
      .map((row) => ({ episode_id: String(row.episode_id), role: String(row.role) }))
  }

  private suppressed(): Set<string> {
    const out = new Set<string>()
    for (const row of this.store.all("SELECT target_id, kind, COUNT(*) AS n FROM feedback WHERE target_kind = 'pattern' GROUP BY target_id, kind")) {
      const kind = String(row.kind)
      if (kind === 'never_suggest' || kind === 'forget' || (kind === 'not_useful' && Number(row.n) >= 2) || kind === 'wrong_context') out.add(String(row.target_id))
    }
    for (const row of this.store.all("SELECT body FROM preferences WHERE kind = 'never_suggest' AND revoked_at IS NULL")) {
      const pref = json<{ pattern_id: string | null }>(row.body)
      if (pref.pattern_id) out.add(pref.pattern_id)
    }
    return out
  }

  private accepted(): Set<string> {
    return new Set(this.store.all("SELECT body FROM preferences WHERE kind = 'routine' AND revoked_at IS NULL")
      .map((row) => json<{ pattern_id: string | null }>(row.body).pattern_id)
      .filter((id): id is string => Boolean(id)))
  }

  /**
   * Abitudini dimenticate su richiesta: l'ID è deterministico (contesto + sequenza),
   * quindi senza questo filtro il miner le ricostruirebbe dagli stessi episodi.
   * "Dimentica" prevale sulle inferenze (§11, §23).
   */
  private forgotten(): Set<string> {
    return new Set(this.store.all('SELECT selector FROM deletion_tombstones')
      .map((row) => json<{ pattern_id?: string | null }>(row.selector).pattern_id)
      .filter((id): id is string => Boolean(id)))
  }

  /** Esegue il miner su episodi conclusi nella finestra statistica; budget limitato a 2.000 episodi. */
  refresh(config: CoreConfig, demo: boolean): MinedPattern[] {
    const now = this.clock.now()
    const windowFrom = new Date(now.getTime() - config.privacy.retention_days.statistics * 86_400_000).toISOString()
    const episodes = this.episodes.list({ demo, limit: 2_000, finalizedOnly: true }).filter((episode) => episode.arrived_at >= windowFrom)
    const tz = config.runtime.timezone

    const arrivalWindows = episodes.map((episode) => [episode.window_from, episode.window_until] as const)
    const intents = this.store.all(
      `SELECT body FROM observed_events WHERE kind = 'manual.intent' AND attribution = 'manual_confirmed' AND demo = ? AND occurred_at >= ?`,
      demo ? 1 : 0, windowFrom,
    ).map((row) => json<EventOf<'manual.intent'>>(row.body))
    const observedDays = new Set(episodes.map((episode) => episode.local_date))
    for (const intent of intents) observedDays.add(localParts(new Date(intent.occurred_at), tz).date)

    const outside = intents.filter((intent) => !arrivalWindows.some(([from, until]) => intent.occurred_at >= from && intent.occurred_at <= until))
    const baselineDays = (token: string, daypart: string) => new Set(outside
      .filter((intent) => actionToken(intent.payload.action_key, intent.payload.target_entity_ids) === token)
      .map((intent) => {
        const local = localParts(new Date(intent.occurred_at), tz)
        return { date: local.date, daypart: daypartOf(local.hour) }
      })
      .filter((entry) => entry.daypart === daypart)
      .map((entry) => entry.date))

    const previous = new Map(this.list({ demo, includeRetired: true }).map((pattern) => [pattern.pattern_id, pattern]))
    const forgotten = this.forgotten()
    const mined = mineArrivalPatterns({
      episodes,
      config: config.learning,
      now,
      baselineDays,
      observedDays,
      suppressedPatternIds: this.suppressed(),
      acceptedPatternIds: this.accepted(),
      previous,
      demo,
    }).filter((pattern) => !forgotten.has(pattern.pattern_id))

    this.store.tx(() => {
      const seen = new Set<string>()
      for (const pattern of mined) {
        seen.add(pattern.pattern_id)
        const { evidence, ...body } = pattern
        this.store.run(
          `INSERT INTO patterns (pattern_id, revision, state, subject_id, demo, body, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)
           ON CONFLICT(pattern_id) DO UPDATE SET revision = excluded.revision, state = excluded.state, body = excluded.body, updated_at = excluded.updated_at`,
          pattern.pattern_id, pattern.revision, pattern.state, demo ? 1 : 0, JSON.stringify(body), now.toISOString(),
        )
        this.store.run('DELETE FROM pattern_evidence WHERE pattern_id = ?', pattern.pattern_id)
        for (const entry of evidence) {
          this.store.run('INSERT OR IGNORE INTO pattern_evidence (pattern_id, episode_id, role) VALUES (?, ?, ?)', pattern.pattern_id, entry.episode_id, entry.role)
        }
      }
      // Ipotesi non più ritrovate: si ritirano con motivo, non si cancellano in silenzio.
      for (const [id, old] of previous) {
        if (seen.has(id) || old.state === 'retired' || old.state === 'suppressed') continue
        const retired = { ...old, state: 'retired' as const, revision: old.revision + 1, status_reason: ['NO_LONGER_OBSERVED'] }
        this.store.run('UPDATE patterns SET state = ?, revision = ?, body = ?, updated_at = ? WHERE pattern_id = ?',
          'retired', retired.revision, JSON.stringify(retired), now.toISOString(), id)
      }
    })
    return mined
  }

  /** Episodi a sostegno/contro, per "Perché me lo proponi?". */
  explain(patternId: string): { pattern: StoredPattern; episodes: (StoredEpisode & { role: string })[] } | null {
    const pattern = this.get(patternId)
    if (!pattern) return null
    const episodes = this.evidence(patternId)
      .map((entry) => {
        const episode = this.episodes.get(entry.episode_id)
        return episode ? { ...episode, role: entry.role } : null
      })
      .filter((episode): episode is StoredEpisode & { role: string } => episode !== null)
      .sort((a, b) => b.arrived_at.localeCompare(a.arrived_at))
    return { pattern, episodes }
  }
}
