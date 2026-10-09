import type { ArrivalEpisode, EventOf, ObservedEvent } from '../domain/contracts.js'
import { newId } from '../domain/ids.js'
import { daypartOf, localParts, type Clock } from '../domain/time.js'
import type { CoreConfig } from '../config.js'
import { CoreStore, json } from '../storage/db.js'
import type { StateProjection } from '../context/projection.js'
import { ADJUSTMENT_KEYS } from '../ingestion/telemetry.js'

/**
 * Riconoscitore dei rientri (specifica §12):
 *
 *   absence_candidate → absent_confirmed → arrival_candidate → present_stable
 *                                                   ↘ ambiguous / cancelled
 *
 * Livello di nucleo: la casa "rientra" quando passa da tutti assenti ad
 * almeno un presente, dopo un'assenza reale (≥ `previous_absence_minutes`) e
 * con presenza stabile per `presence_stability_seconds`. Flapping, snapshot e
 * riconnessioni non creano rientri (T12, T13). Una transizione `person.*` a
 * `home` è un indizio della persona, non prova chi abbia toccato il tablet.
 */

interface HouseholdState {
  status: 'present' | 'absence_candidate' | 'arrival_candidate' | 'unknown'
  absent_since: string | null
  members: Record<string, 'home' | 'away' | 'unknown'>
  candidate_episode_id: string | null
  /** Inizio dell'assenza che ha preceduto il rientro candidato (ripristinato se si annulla). */
  candidate_absent_since: string | null
  last_arrival_at: string | null
  demo: boolean
  /** Istante dell'ultimo segnale applicato per fonte di presenza (ordine affidabile, T10). */
  member_at?: Record<string, string>
}

const STATE_KEY = 'arrival_state'

export interface EpisodeAction {
  operation_id: string
  action_key: string
  targets: string[]
  token: string
  at: string
  offset_s: number
  /** Numero di aggiornamenti dello stesso gesto confluiti nella sessione (slider). */
  session_updates: number
}

export interface StoredEpisode extends ArrivalEpisode {
  actions: EpisodeAction[]
  demo: boolean
  finalized_at: string | null
}

export function actionToken(actionKey: string, targets: string[]): string {
  return `${actionKey}|${[...targets].sort().join(',')}`
}

export class ArrivalTracker {
  constructor(
    private readonly store: CoreStore,
    private readonly projection: StateProjection,
    private readonly clock: Clock,
  ) {}

  private load(): HouseholdState {
    const raw = this.store.getMeta(STATE_KEY)
    return raw
      ? JSON.parse(raw) as HouseholdState
      : { status: 'unknown', absent_since: null, members: {}, candidate_episode_id: null, candidate_absent_since: null, last_arrival_at: null, demo: false }
  }

  private save(state: HouseholdState): void { this.store.setMeta(STATE_KEY, JSON.stringify(state)) }

  reset(): void { this.store.run('DELETE FROM meta WHERE key = ?', STATE_KEY) }

  onPresence(event: EventOf<'presence.signal'>, demo: boolean, config: CoreConfig): void {
    const state = this.load()
    // Un segnale riordinato più vecchio dell'ultimo applicato per la stessa fonte resta
    // nel registro ma non riscrive lo stato corrente (come la proiezione, T10).
    const source = event.payload.presence_source_id
    const memberAt = state.member_at ?? {}
    const lastAt = memberAt[source]
    if (lastAt && Date.parse(event.occurred_at) < Date.parse(lastAt)) return
    memberAt[source] = event.occurred_at
    state.member_at = memberAt
    const wasAnyHome = Object.values(state.members).some((status) => status === 'home')
    state.members[source] = event.payload.status
    state.demo = demo
    const members = Object.values(state.members)
    const anyHome = members.some((status) => status === 'home')
    const allAway = members.length > 0 && members.every((status) => status === 'away')
    const at = event.occurred_at

    // Snapshot/backfill aggiornano la conoscenza ma non sono rientri appena accaduti.
    if (event.delivery === 'snapshot' || event.delivery === 'backfill') {
      state.status = anyHome ? 'present' : allAway ? 'absence_candidate' : 'unknown'
      if (allAway && !state.absent_since) state.absent_since = at
      if (anyHome) state.absent_since = null
      this.save(state)
      return
    }

    if (allAway) {
      if (state.status === 'arrival_candidate' && state.candidate_episode_id) {
        // Rientro non stabilizzato: annullato, l'assenza originale continua.
        this.updateEpisodeState(state.candidate_episode_id, 'cancelled')
        state.candidate_episode_id = null
        state.status = 'absence_candidate'
        state.absent_since = state.candidate_absent_since ?? at
        state.candidate_absent_since = null
      } else if (state.status !== 'absence_candidate' || !state.absent_since) {
        state.status = 'absence_candidate'
        state.absent_since = at
      }
      this.save(state)
      return
    }

    if (anyHome && !wasAnyHome && state.status === 'absence_candidate' && state.absent_since) {
      const absenceMs = Date.parse(at) - Date.parse(state.absent_since)
      if (absenceMs < config.arrival.previous_absence_minutes * 60_000) {
        // Flapping: nessun rientro, nessun episodio duplicato (T13).
        state.status = 'present'
        state.absent_since = null
        this.save(state)
        return
      }
      const cooldown = state.last_arrival_at
        && Date.parse(at) - Date.parse(state.last_arrival_at) < config.arrival.duplicate_cooldown_minutes * 60_000
      const episode = this.createEpisode(at, state.absent_since, config, demo, Boolean(cooldown), event)
      state.status = 'arrival_candidate'
      state.candidate_episode_id = episode.episode_id
      state.candidate_absent_since = state.absent_since
      state.absent_since = null
      this.save(state)
      return
    }

    if (anyHome && state.status === 'unknown') state.status = 'present'
    this.save(state)
  }

  private createEpisode(at: string, absentSince: string, config: CoreConfig, demo: boolean, ambiguous: boolean, event: EventOf<'presence.signal'>): StoredEpisode {
    const tz = config.runtime.timezone
    const arrived = new Date(at)
    const local = localParts(arrived, tz)
    const episode: StoredEpisode = {
      schema_version: 1,
      episode_id: newId('arr'),
      state: ambiguous ? 'ambiguous' : 'arrival_candidate',
      scope: { kind: 'household', subject_id: null },
      subject_id: event.payload.subject_id,
      absent_since: absentSince,
      arrived_at: at,
      stable_at: null,
      window_from: new Date(arrived.getTime() - config.arrival.episode_before_minutes * 60_000).toISOString(),
      window_until: new Date(arrived.getTime() + config.arrival.episode_after_minutes * 60_000).toISOString(),
      local_date: local.date,
      weekday: local.weekday,
      daypart: daypartOf(local.hour),
      coverage: 'unknown',
      others_present: false,
      guests: false,
      door_evidence: false,
      action_operation_ids: [],
      automation_effects: [],
      late_corrected: false,
      actions: [],
      demo,
      finalized_at: null,
    }
    this.persist(episode)
    return episode
  }

  /** Avanza le transizioni a tempo: stabilizzazione e chiusura delle finestre. */
  advance(config: CoreConfig, guests: boolean): StoredEpisode[] {
    const now = this.clock.now()
    const state = this.load()
    if (state.status === 'arrival_candidate' && state.candidate_episode_id) {
      const episode = this.get(state.candidate_episode_id)
      if (episode && now.getTime() - Date.parse(episode.arrived_at) >= config.arrival.presence_stability_seconds * 1_000) {
        if (episode.state === 'arrival_candidate') {
          episode.state = 'present_stable'
          episode.stable_at = new Date(Date.parse(episode.arrived_at) + config.arrival.presence_stability_seconds * 1_000).toISOString()
        }
        episode.guests = guests
        this.persist(episode)
        state.status = 'present'
        state.last_arrival_at = episode.arrived_at
        state.candidate_episode_id = null
        state.candidate_absent_since = null
        this.save(state)
      }
    }
    return this.finalizeDue(now)
  }

  /** Chiude gli episodi la cui finestra è terminata, raccogliendo azioni ed effetti. */
  finalizeDue(now: Date): StoredEpisode[] {
    const rows = this.store.all(
      "SELECT body FROM episodes WHERE kind = 'arrival' AND state IN ('present_stable', 'ambiguous') AND json_extract(body, '$.finalized_at') IS NULL AND json_extract(body, '$.window_until') <= ?",
      now.toISOString(),
    )
    const out: StoredEpisode[] = []
    for (const row of rows) {
      const episode = this.collect(json<StoredEpisode>(row.body))
      episode.finalized_at = now.toISOString()
      this.persist(episode)
      out.push(episode)
    }
    return out
  }

  /** Un evento tardivo dentro una finestra già chiusa corregge l'episodio offline (T11). */
  correctLate(event: ObservedEvent): StoredEpisode | null {
    const row = this.store.get(
      "SELECT body FROM episodes WHERE kind = 'arrival' AND json_extract(body, '$.finalized_at') IS NOT NULL AND json_extract(body, '$.window_from') <= ? AND json_extract(body, '$.window_until') >= ?",
      event.occurred_at, event.occurred_at,
    )
    if (!row) return null
    const episode = this.collect(json<StoredEpisode>(row.body))
    episode.late_corrected = true
    this.persist(episode)
    return episode
  }

  private collect(episode: StoredEpisode): StoredEpisode {
    const intents = this.store.all(
      `SELECT body FROM observed_events WHERE kind = 'manual.intent' AND attribution = 'manual_confirmed'
       AND occurred_at >= ? AND occurred_at <= ? AND demo = ? ORDER BY occurred_at`,
      episode.window_from, episode.window_until, episode.demo ? 1 : 0,
    ).map((r) => json<EventOf<'manual.intent'>>(r.body))
      // Un tablet condiviso non identifica la persona: azioni personali solo da scope personale (T14).
      .filter((event) => episode.scope.kind !== 'person' || (event.scope.kind === 'person' && event.scope.subject_id === episode.scope.subject_id))

    const actions: EpisodeAction[] = []
    let previousControl: string | null = null
    for (const intent of intents) {
      const token = actionToken(intent.payload.action_key, intent.payload.target_entity_ids)
      const previous = actions[actions.length - 1]
      // Aggiornamenti ravvicinati dello stesso slider = una sessione (T05). Due click
      // deliberati restano due azioni con due operation_id, anche se ravvicinati (T01).
      const continuous = intent.payload.control === 'slider' && previousControl === 'slider'
      previousControl = intent.payload.control
      if (previous && continuous && previous.token === token && ADJUSTMENT_KEYS.has(intent.payload.action_key)
        && Date.parse(intent.occurred_at) - Date.parse(previous.at) <= 15_000) {
        previous.session_updates += 1
        previous.at = intent.occurred_at
        continue
      }
      actions.push({
        operation_id: intent.payload.operation_id,
        action_key: intent.payload.action_key,
        targets: intent.payload.target_entity_ids,
        token,
        at: intent.occurred_at,
        offset_s: Math.round((Date.parse(intent.occurred_at) - Date.parse(episode.arrived_at)) / 1_000),
        session_updates: 1,
      })
    }

    const automation = this.store.all(
      `SELECT DISTINCT ee.entity_id FROM observed_events e JOIN event_entities ee ON ee.event_id = e.event_id
       WHERE e.kind = 'state.changed' AND e.attribution = 'automation' AND e.occurred_at >= ? AND e.occurred_at <= ? AND e.demo = ?`,
      episode.window_from, episode.window_until, episode.demo ? 1 : 0,
    ).map((r) => String(r.entity_id))

    const doorFrom = new Date(Date.parse(episode.arrived_at) - 2 * 60_000).toISOString()
    const doorUntil = new Date(Date.parse(episode.arrived_at) + 60_000).toISOString()
    const door = this.store.get(
      `SELECT COUNT(*) AS n FROM observed_events e JOIN entity_catalog c ON c.entity_id = json_extract(e.body, '$.payload.entity_id')
       WHERE e.kind = 'state.changed' AND c.role = 'door' AND e.occurred_at >= ? AND e.occurred_at <= ?
       AND json_extract(e.body, '$.payload.after.state') IN ('on', 'open')`,
      doorFrom, doorUntil,
    )

    const gaps = this.projection.gapsOverlapping(episode.window_from, episode.window_until)
    return {
      ...episode,
      actions,
      action_operation_ids: actions.map((action) => action.operation_id).slice(0, 50),
      automation_effects: automation.slice(0, 50),
      door_evidence: Number(door?.n ?? 0) > 0,
      coverage: gaps.length ? 'partial' : 'complete',
    }
  }

  private updateEpisodeState(episodeId: string, state: ArrivalEpisode['state']): void {
    const episode = this.get(episodeId)
    if (!episode) return
    episode.state = state
    this.persist(episode)
  }

  private persist(episode: StoredEpisode): void {
    this.store.run(
      `INSERT INTO episodes (episode_id, kind, state, subject_id, local_date, started_at, demo, body, updated_at)
       VALUES (?, 'arrival', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(episode_id) DO UPDATE SET state = excluded.state, body = excluded.body, updated_at = excluded.updated_at`,
      episode.episode_id, episode.state, episode.subject_id, episode.local_date, episode.arrived_at, episode.demo ? 1 : 0,
      JSON.stringify(episode), this.clock.now().toISOString(),
    )
    this.store.run('DELETE FROM episode_events WHERE episode_id = ?', episode.episode_id)
    for (const op of episode.action_operation_ids) {
      const intent = this.store.get("SELECT event_id FROM observed_events WHERE operation_id = ? AND kind = 'manual.intent'", op)
      if (intent) this.store.run('INSERT OR IGNORE INTO episode_events (episode_id, event_id, role) VALUES (?, ?, ?)', episode.episode_id, String(intent.event_id), 'action')
    }
  }

  get(episodeId: string): StoredEpisode | null {
    const row = this.store.get('SELECT body FROM episodes WHERE episode_id = ?', episodeId)
    return row ? json<StoredEpisode>(row.body) : null
  }

  list(opts: { demo?: boolean; limit: number; finalizedOnly?: boolean }): StoredEpisode[] {
    const where = ["kind = 'arrival'"]
    const params: (string | number)[] = []
    if (opts.demo !== undefined) { where.push('demo = ?'); params.push(opts.demo ? 1 : 0) }
    if (opts.finalizedOnly) where.push("json_extract(body, '$.finalized_at') IS NOT NULL")
    return this.store.all(`SELECT body FROM episodes WHERE ${where.join(' AND ')} ORDER BY started_at DESC LIMIT ?`, ...params, opts.limit)
      .map((row) => json<StoredEpisode>(row.body))
  }
}
