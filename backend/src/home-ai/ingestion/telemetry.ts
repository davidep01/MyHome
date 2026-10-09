import { arr, enm, num, obj, opt, parse, str, type Infer } from '../domain/schema.js'
import { EntityId, Id, ScalarMap } from '../domain/contracts.js'
import type { Clock } from '../domain/time.js'
import type { IngestResult } from './event-log.js'
import { makeEvent, quality } from './normalize.js'
import type { ObservedEvent } from '../domain/contracts.js'

/**
 * Telemetria delle azioni manuali della dashboard (specifica §7).
 *
 * Tre concetti separati: intenzione (il gesto), esito del percorso manuale
 * esistente (accettato/fallito/ignoto) ed effetto osservato (un cambio di
 * stato correlato in modo verificabile tramite il `context.id` di HA).
 *
 * La telemetria NON è un comando: viaggia su un canale separato, un suo
 * guasto non blocca né ripete il comando, e il core non la reinvia mai a HA.
 */

/** Registro chiuso delle chiavi semantiche: nessuna stringa diventa codice. */
const ACTION_KEYS: Record<string, Record<string, string>> = {
  light: { turn_on: 'lighting.on', turn_off: 'lighting.off', toggle: 'lighting.toggle' },
  switch: { turn_on: 'switch.on', turn_off: 'switch.off', toggle: 'switch.toggle' },
  input_boolean: { turn_on: 'switch.on', turn_off: 'switch.off', toggle: 'switch.toggle' },
  fan: { turn_on: 'fan.on', turn_off: 'fan.off', set_percentage: 'fan.speed', toggle: 'fan.toggle' },
  climate: { set_temperature: 'climate.temperature', set_hvac_mode: 'climate.mode', set_preset_mode: 'climate.preset', turn_on: 'climate.on', turn_off: 'climate.off' },
  cover: { open_cover: 'cover.open', close_cover: 'cover.close', stop_cover: 'cover.stop', set_cover_position: 'cover.position' },
  media_player: { media_play: 'media.play', media_pause: 'media.pause', media_play_pause: 'media.toggle', volume_set: 'media.volume', turn_on: 'media.on', turn_off: 'media.off' },
  scene: { turn_on: 'scene.activate' },
  script: { turn_on: 'script.run' },
  vacuum: { start: 'vacuum.start', return_to_base: 'vacuum.dock' },
  humidifier: { turn_on: 'humidifier.on', turn_off: 'humidifier.off', set_humidity: 'humidifier.target' },
}

export const KNOWN_ACTION_KEYS = new Set(Object.values(ACTION_KEYS).flatMap((services) => Object.values(services)))

/** Chiave semantica per dominio/servizio; null = azione non mappata. */
export function actionKeyFor(domain: string, service: string): string | null {
  return ACTION_KEYS[domain]?.[service] ?? null
}

/** Controlli a regolazione continua: più aggiornamenti dello stesso gesto = una sessione. */
export const ADJUSTMENT_KEYS = new Set(['lighting.on', 'fan.speed', 'climate.temperature', 'cover.position', 'media.volume', 'humidifier.target'])

/**
 * Input dal client: dominio e servizio del gesto. La chiave semantica la
 * deriva il SERVER dal registro chiuso (unica fonte), mai dal browser.
 */
export const ManualIntentInput = obj({
  operation_id: Id,
  interaction_id: Id,
  control: enm(['button', 'toggle', 'slider', 'scene', 'other'] as const),
  domain: str({ min: 1, max: 40, pattern: /^[a-z_]+$/ }),
  service: str({ min: 1, max: 60, pattern: /^[a-z_]+$/ }),
  target_entity_ids: arr(EntityId, { min: 1, max: 100, unique: true }),
  requested: ScalarMap,
  occurred_at: opt(str({ max: 40, format: 'date-time' })),
})
export type ManualIntentInput = Infer<typeof ManualIntentInput>

export const ManualResultInput = obj({
  operation_id: Id,
  result: enm(['accepted', 'failed', 'unknown'] as const),
  reason_code: opt(str({ max: 64, pattern: /^[A-Z][A-Z0-9_]*$/ })),
  ha_status: opt(num({ min: 0, max: 999, integer: true })),
})

export interface TelemetryActor { role: 'admin' | 'kiosk'; authMode: 'disabled' | 'required' }

export interface TelemetryDeps {
  clock: Clock
  ingest: (event: ObservedEvent) => IngestResult
  selected: () => Set<string>
  enabled: () => boolean
}

const MAX_CONTEXTS = 500
const CONTEXT_TTL_MS = 10 * 60_000

export class ManualTelemetry {
  /** Mappa temporanea context HA → operazione, limitata in dimensione e durata. */
  private readonly contexts = new Map<string, { operation_id: string; at: number }>()
  private readonly coverage = { intents: 0, outOfScope: 0, unmapped: 0, results: 0 }

  constructor(private readonly deps: TelemetryDeps) {}

  stats() { return { ...this.coverage } }

  recordIntent(raw: unknown, actor: TelemetryActor): IngestResult | { status: 'out_of_scope' | 'invalid' | 'disabled'; reason: string } {
    if (!this.deps.enabled()) return { status: 'disabled', reason: 'osservazione reale non attiva' }
    const parsed = parse(ManualIntentInput, raw)
    if (!parsed.ok) return { status: 'invalid', reason: parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ') }
    const input = parsed.value
    const actionKey = actionKeyFor(input.domain, input.service)
    if (!actionKey) { this.coverage.unmapped += 1; return { status: 'invalid', reason: 'azione non mappata' } }
    const selected = this.deps.selected()
    const targets = input.target_entity_ids.filter((id) => selected.has(id))
    if (!targets.length) { this.coverage.outOfScope += 1; return { status: 'out_of_scope', reason: 'nessuna entità selezionata' } }

    const now = this.deps.clock.now()
    const claimed = input.occurred_at ? Date.parse(input.occurred_at) : NaN
    const occurred = Number.isFinite(claimed) && Math.abs(claimed - now.getTime()) <= 5 * 60_000 ? new Date(claimed) : now
    const reasons = ['DASHBOARD_GESTURE', actor.role === 'kiosk' ? 'SHARED_DEVICE' : 'ADMIN_DEVICE']
    if (actor.authMode === 'disabled') reasons.push('LAN_TRUST_AUTH_DISABLED')
    this.coverage.intents += 1
    return this.deps.ingest(makeEvent({
      kind: 'manual.intent',
      source: { id: 'dashboard', kind: 'dashboard', native_id: `${input.operation_id}:intent` },
      occurred_at: occurred.toISOString(),
      received_at: now.toISOString(),
      delivery: 'live',
      // Il dispositivo non identifica la persona: scope del nucleo, nessun soggetto.
      scope: { kind: 'household', subject_id: null },
      actor_id: actor.role === 'kiosk' ? 'device-kiosk' : 'device-admin',
      quality: quality('manual_confirmed', 1, reasons),
      payload: {
        operation_id: input.operation_id,
        interaction_id: input.interaction_id,
        control: input.control,
        action_key: actionKey,
        target_entity_ids: targets,
        requested: input.requested,
      },
    }))
  }

  /** Esito dal percorso manuale backend (proxy servizi) o dal client; deduplicato per operazione. */
  recordResult(raw: unknown, haContextId: string | null = null): IngestResult | { status: 'invalid' | 'disabled'; reason: string } {
    if (!this.deps.enabled()) return { status: 'disabled', reason: 'osservazione reale non attiva' }
    const parsed = parse(ManualResultInput, raw)
    if (!parsed.ok) return { status: 'invalid', reason: parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ') }
    const input = parsed.value
    const now = this.deps.clock.now()
    if (haContextId) this.rememberContext(haContextId, input.operation_id, now.getTime())
    this.coverage.results += 1
    return this.deps.ingest(makeEvent({
      kind: 'manual.result',
      source: { id: 'dashboard', kind: 'dashboard', native_id: `${input.operation_id}:result` },
      occurred_at: now.toISOString(),
      received_at: now.toISOString(),
      delivery: 'live',
      quality: quality('manual_confirmed', 1, ['MANUAL_PATH_RESULT']),
      context: { id: haContextId, parent_id: null },
      payload: {
        operation_id: input.operation_id,
        result: input.result,
        reason_code: input.reason_code ?? (input.ha_status && input.ha_status >= 400 ? `HA_STATUS_${input.ha_status}` : null),
        ha_context_id: haContextId,
      },
    }))
  }

  operationForContext(contextId: string | null): { operation_id: string } | null {
    if (!contextId) return null
    const entry = this.contexts.get(contextId)
    if (!entry) return null
    if (this.deps.clock.now().getTime() - entry.at > CONTEXT_TTL_MS) { this.contexts.delete(contextId); return null }
    return { operation_id: entry.operation_id }
  }

  private rememberContext(contextId: string, operationId: string, at: number): void {
    this.contexts.set(contextId, { operation_id: operationId, at })
    if (this.contexts.size > MAX_CONTEXTS) {
      const oldest = this.contexts.keys().next().value
      if (oldest !== undefined) this.contexts.delete(oldest)
    }
  }
}

/** Estrae il primo `context.id` dalla risposta di `POST /api/services/...` di HA. */
export function contextIdFromServiceResponse(body: unknown): string | null {
  if (!Array.isArray(body)) return null
  for (const state of body) {
    const id = (state as { context?: { id?: unknown } })?.context?.id
    if (typeof id === 'string' && id.length <= 64) return id
  }
  return null
}
