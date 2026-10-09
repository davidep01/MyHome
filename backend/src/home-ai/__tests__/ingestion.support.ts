import { BridgeFeedAdapter, type BridgeEvent } from '../adapters/ha-feed.js'
import type { CoreConfig } from '../config.js'
import type { HomeAiCore } from '../core.js'
import type { EventKind, EventOf } from '../domain/contracts.js'
import type { StoredEpisode } from '../episodes/arrival.js'
import { makeEvent, quality, type HaContext, type HaEntityLike } from '../ingestion/normalize.js'
import type { TelemetryActor } from '../ingestion/telemetry.js'
import { newCore } from './helpers.js'

/**
 * Casa "reale" finta per i test di telemetria, ingestione ed episodi.
 *
 * Nessuna demo, nessuna rete, nessun Home Assistant: gli stati arrivano dal
 * vero `BridgeFeedAdapter` alimentato a mano, la telemetria dal vero
 * `ManualTelemetry`, il tempo da un `ManualClock`.
 */

export const ENTRANCE = 'light.ingresso'
export const LIVING = 'light.soggiorno'
export const PORCH = 'light.portico'
export const CLIMATE = 'climate.soggiorno'
export const PERSON_A = 'person.anna'
export const PERSON_B = 'person.marco'

/** Lunedì 12/10/2026, 16:00 a Roma. */
export const START = '2026-10-12T14:00:00.000Z'
/** Rientro serale di riferimento: 18:30 a Roma (CEST). */
export const ARRIVAL = '2026-10-12T16:30:00.000Z'

export const KIOSK: TelemetryActor = { role: 'kiosk', authMode: 'disabled' }

export const iso = (base: string, seconds: number): string => new Date(Date.parse(base) + seconds * 1_000).toISOString()

/** Osservazione e apprendimento reali consentiti, solo entità selezionate, meteo spento. */
export function realHome(extra?: (config: CoreConfig) => void): (config: CoreConfig) => void {
  return (config) => {
    config.runtime.demo = false
    config.sources.home_assistant.enabled = true
    config.sources.home_assistant.selected_entities = [ENTRANCE, LIVING, PORCH, CLIMATE]
    config.sources.home_assistant.presence_entities = [PERSON_A, PERSON_B]
    config.privacy.real_observation_enabled = true
    config.privacy.real_learning_enabled = true
    config.sources.weather.adapter = 'none'
    extra?.(config)
  }
}

/** Stesso cablaggio del ponte HA di `index.ts`, ma alimentato dal test. */
export function feedFor(core: HomeAiCore): BridgeFeedAdapter {
  return new BridgeFeedAdapter({
    clock: core.clock,
    selected: () => core.catalog.selectedIds(),
    presenceEntities: () => new Set(core.config().sources.home_assistant.presence_entities),
    personalProfiles: () => core.config().privacy.personal_profiles_enabled,
    currentState: (id) => core.projection.get(id)?.value ?? null,
    operationForContext: (id) => core.telemetry.operationForContext(id),
    emit: (event) => { core.ingest(event, { demo: false }); core.process() },
  })
}

export async function newRealCore(start = START, extra?: (config: CoreConfig) => void) {
  const env = await newCore(start, realHome(extra))
  return { ...env, feed: feedFor(env.core) }
}

export type RealEnv = Awaited<ReturnType<typeof newRealCore>>

export function haEntity(entityId: string, state: string, at: string, context?: HaContext): HaEntityLike {
  return { entity_id: entityId, state, attributes: {}, last_changed: at, last_updated: at, context }
}

export const delta = (...changed: HaEntityLike[]): BridgeEvent => ({ type: 'delta', changed, removed: [] })
export const snapshot = (...entities: HaEntityLike[]): BridgeEvent => ({ type: 'snapshot', entities })

/** Gesto sulla dashboard: passa dal vero canale di telemetria (il server deriva la chiave semantica). */
export function click(
  core: HomeAiCore,
  operationId: string,
  opts: {
    domain?: string
    service?: string
    targets?: string[]
    control?: 'button' | 'toggle' | 'slider' | 'scene' | 'other'
    requested?: Record<string, string | number | boolean | null>
  } = {},
  actor: TelemetryActor = KIOSK,
) {
  return core.telemetry.recordIntent({
    operation_id: operationId,
    interaction_id: `${operationId}-g`,
    control: opts.control ?? 'button',
    domain: opts.domain ?? 'light',
    service: opts.service ?? 'turn_on',
    target_entity_ids: opts.targets ?? [ENTRANCE],
    requested: opts.requested ?? {},
  }, actor)
}

/** Eventi persistiti di un tipo, in ordine cronologico. */
export function eventsOf<K extends EventKind>(core: HomeAiCore, kind: K): EventOf<K>[] {
  return core.events.list({ kinds: [kind], limit: 500, includePersonal: true })
    .filter((event): event is EventOf<K> => event.kind === kind)
    .reverse()
}

export function countRows(env: { store: HomeAiCore['store'] }, table: string): number {
  return Number(env.store.get(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0)
}

export function presenceSignal(
  status: 'home' | 'away' | 'unknown',
  at: string,
  opts: { source?: string; receivedAt?: string; eventId?: string } = {},
): EventOf<'presence.signal'> {
  return makeEvent({
    kind: 'presence.signal',
    event_id: opts.eventId,
    source: { id: 'ha', kind: 'ha', native_id: null },
    occurred_at: at,
    received_at: opts.receivedAt ?? at,
    delivery: 'live',
    quality: quality('system', 1, ['PRESENCE_ENTITY']),
    payload: { presence_source_id: opts.source ?? 'presence-anna', status, subject_id: null },
  })
}

export function intentEvent(
  operationId: string,
  target: string,
  at: string,
  opts: { receivedAt?: string; eventId?: string; actionKey?: string } = {},
): EventOf<'manual.intent'> {
  return makeEvent({
    kind: 'manual.intent',
    event_id: opts.eventId,
    source: { id: 'dashboard', kind: 'dashboard', native_id: `${operationId}:intent` },
    occurred_at: at,
    received_at: opts.receivedAt ?? at,
    delivery: 'live',
    actor_id: 'device-kiosk',
    quality: quality('manual_confirmed', 1, ['DASHBOARD_GESTURE', 'SHARED_DEVICE']),
    payload: {
      operation_id: operationId,
      interaction_id: `${operationId}-g`,
      control: 'button',
      action_key: opts.actionKey ?? 'lighting.on',
      target_entity_ids: [target],
      requested: {},
    },
  })
}

export function stateEvent(
  entityId: string,
  state: string,
  at: string,
  opts: { receivedAt?: string; eventId?: string; effectOf?: string; contextId?: string } = {},
): EventOf<'state.changed'> {
  return makeEvent({
    kind: 'state.changed',
    event_id: opts.eventId,
    source: { id: 'ha', kind: 'ha', native_id: opts.contextId ? `${opts.contextId}:${entityId}` : null },
    occurred_at: at,
    received_at: opts.receivedAt ?? at,
    delivery: 'live',
    quality: opts.effectOf
      ? quality('manual_confirmed', 0.95, ['EFFECT_OF_DASHBOARD_OPERATION'])
      : quality('unknown', 0, ['NO_ORIGIN_EVIDENCE']),
    context: { id: opts.contextId ?? null, parent_id: null },
    payload: {
      entity_id: entityId,
      before: null,
      after: { state, attributes: {}, source_updated_at: at, availability: 'available' },
      effect_of_operation_id: opts.effectOf ?? null,
    },
  })
}

/**
 * Porta la casa a un rientro stabile attraverso il ponte HA: assenza
 * (default 45 minuti), presenza, stabilizzazione di 60 secondi.
 */
export async function arrive(env: RealEnv, arrivedAt: string, opts: { entity?: string; absentMinutes?: number } = {}): Promise<StoredEpisode> {
  const entity = opts.entity ?? PERSON_A
  const at = new Date(arrivedAt).toISOString()
  const leftAt = iso(at, -(opts.absentMinutes ?? 45) * 60)
  env.clock.set(leftAt)
  env.feed.handle(delta(haEntity(entity, 'not_home', leftAt)))
  env.clock.set(at)
  env.feed.handle(delta(haEntity(entity, 'home', at)))
  env.clock.set(iso(at, 61))
  await env.core.tick({ light: true })
  const episode = env.core.arrivals.list({ limit: 50 }).find((candidate) => candidate.arrived_at === at)
  if (!episode) throw new Error(`rientro delle ${at} non riconosciuto`)
  return episode
}

/** Chiude la finestra dell'episodio (20 minuti dopo il rientro) e lo restituisce finalizzato. */
export async function closeWindow(env: RealEnv, episode: StoredEpisode): Promise<StoredEpisode> {
  env.clock.set(episode.window_until)
  await env.core.tick({ light: true })
  const closed = env.core.arrivals.get(episode.episode_id)
  if (!closed?.finalized_at) throw new Error('finestra dell’episodio non chiusa')
  return closed
}
