import type { EventKind, EventOf, ObservedEvent, Quality, Scope, StateValue } from '../domain/contracts.js'

type Attribution = Quality['attribution']
import { newId } from '../domain/ids.js'

/**
 * Normalizzazione e minimizzazione (specifica §6, §8, §23).
 *
 * L'involucro HA è ricco e annidato: qui si riduce a `StateValue` con i soli
 * attributi in allowlist per dominio, prima di qualunque persistenza. Mai
 * coordinate, immagini, token, picture URL o testi liberi.
 */

const ATTRIBUTE_ALLOWLIST: Record<string, string[]> = {
  light: ['brightness'],
  climate: ['hvac_action', 'current_temperature', 'temperature'],
  water_heater: ['temperature'],
  cover: ['current_position'],
  fan: ['percentage'],
  humidifier: ['humidity'],
  media_player: [],
  binary_sensor: ['device_class'],
  sensor: ['device_class', 'unit_of_measurement'],
  weather: ['temperature', 'temperature_unit'],
  switch: [],
  input_boolean: [],
  person: [],
  device_tracker: [],
  lock: [],
  alarm_control_panel: [],
  vacuum: [],
}

/** Attributi mai ammessi, qualunque sia il dominio. */
const NEVER_ATTRIBUTES = /^(latitude|longitude|gps|entity_picture|access_token|token|ip|mac|ssid|media_title|media_artist|address|location|source)/i

export interface HaEntityLike {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
  last_changed?: string
  last_updated?: string
  context?: unknown
}

export function minimizeState(entity: HaEntityLike | null | undefined): StateValue | null {
  if (!entity) return null
  const domain = entity.entity_id.split('.')[0]
  const allow = ATTRIBUTE_ALLOWLIST[domain] ?? []
  const attributes: Record<string, string | number | boolean | null> = {}
  for (const key of allow) {
    if (NEVER_ATTRIBUTES.test(key)) continue
    const value = entity.attributes?.[key]
    if (value === null || typeof value === 'boolean') attributes[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) attributes[key] = value
    else if (typeof value === 'string' && value.length <= 64) attributes[key] = value
  }
  const state = typeof entity.state === 'string' ? entity.state.slice(0, 255) : null
  const availability = state === 'unavailable' ? 'unavailable' : state === 'unknown' || state === null ? 'unknown' : 'available'
  const updated = entity.last_updated ?? entity.last_changed
  return {
    state: availability === 'available' ? state : null,
    attributes,
    source_updated_at: updated && Number.isFinite(Date.parse(updated)) ? new Date(updated).toISOString() : null,
    availability,
  }
}

const SENSOR_DOMAINS = new Set(['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'sun', 'zone', 'update'])

export interface HaContext { id?: string | null; parent_id?: string | null; user_id?: string | null }

/**
 * Attribuzione prudente (specifica §7, tabella delle classi):
 * - effetto di un'operazione manuale nota → resta un effetto, non una nuova azione;
 * - `parent_id` → catena di automazione/script;
 * - `user_id` da solo NON prova un gesto umano (un client API autenticato ha user_id) → manual_likely;
 * - nessun indizio su un dispositivo comandabile → unknown (può essere un interruttore fisico);
 * - sensori → system.
 */
export function attributeHaChange(
  entityId: string,
  context: HaContext | null,
  knownOperation: { operation_id: string } | null,
): { quality: Quality; effectOf: string | null } {
  const domain = entityId.split('.')[0]
  if (knownOperation) {
    return { quality: quality('manual_confirmed', 0.95, ['EFFECT_OF_DASHBOARD_OPERATION']), effectOf: knownOperation.operation_id }
  }
  if (SENSOR_DOMAINS.has(domain)) return { quality: quality('system', 1, ['SENSOR_DOMAIN']), effectOf: null }
  if (context?.parent_id) return { quality: quality('automation', 0.8, ['HA_PARENT_CONTEXT']), effectOf: null }
  if (context?.user_id) return { quality: quality('manual_likely', 0.5, ['HA_USER_ID_ONLY']), effectOf: null }
  return { quality: quality('unknown', 0, ['NO_ORIGIN_EVIDENCE']), effectOf: null }
}

export function quality(attribution: Attribution, score: number, reasons: string[], coverage: Quality['coverage'] = 'complete', stale = false): Quality {
  return { attribution, attribution_score: score, reason_codes: reasons, coverage, stale }
}

export const HOUSEHOLD: Scope = { kind: 'household', subject_id: null }

/** Costruisce un evento del contratto v1 (gli adapter non inventano campi). */
export function makeEvent<K extends EventKind>(input: {
  kind: K
  payload: EventOf<K>['payload']
  source: ObservedEvent['source']
  occurred_at: string
  received_at: string
  delivery: ObservedEvent['delivery']
  quality: Quality
  scope?: Scope
  actor_id?: string | null
  context?: { id: string | null; parent_id: string | null }
  causation_event_id?: string | null
  event_id?: string
  privacy_scope_version?: number
}): EventOf<K> {
  return {
    schema_version: 1,
    event_id: input.event_id ?? newId('evt'),
    source: input.source,
    occurred_at: input.occurred_at,
    received_at: input.received_at,
    delivery: input.delivery,
    scope: input.scope ?? HOUSEHOLD,
    actor_id: input.actor_id ?? null,
    context: input.context ?? { id: null, parent_id: null },
    quality: input.quality,
    causation_event_id: input.causation_event_id ?? null,
    privacy_scope_version: input.privacy_scope_version ?? 1,
    kind: input.kind,
    payload: input.payload,
  } as EventOf<K>
}
