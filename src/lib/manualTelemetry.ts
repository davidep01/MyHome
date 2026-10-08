import { request } from '../api/backend'

/**
 * Telemetria dei gesti manuali per HOME AI CORE (specifica §7).
 *
 * Ogni chiamata di servizio partita da un gesto ha un `operation_id` proprio:
 * due click = due operazioni; un retry della telemetria riusa lo stesso id e
 * il core lo deduplica. L'intenzione e l'esito viaggiano su un canale
 * SEPARATO dal comando, in parallelo e senza attesa: un guasto della
 * telemetria non blocca, non ritarda e non ripete mai il comando.
 */

const SLIDER_KEYS = new Set(['brightness', 'brightness_pct', 'percentage', 'temperature', 'position', 'volume_level', 'humidity'])
const TOGGLE_SERVICES = new Set(['turn_on', 'turn_off', 'toggle'])

/** Id opaco; `crypto.getRandomValues` funziona anche su HTTP in LAN (randomUUID no). */
export function newOperationId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `op-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function targetsOf(data?: Record<string, unknown>): string[] {
  const raw = data?.entity_id
  const ids = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return ids.filter((id): id is string => typeof id === 'string' && /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/.test(id)).slice(0, 100)
}

function requestedOf(data?: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key === 'entity_id' || Object.keys(out).length >= 20 || key.length > 80) continue
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value
    else if (typeof value === 'string' && value.length <= 256) out[key] = value
  }
  return out
}

function controlOf(domain: string, service: string, data?: Record<string, unknown>): 'button' | 'toggle' | 'slider' | 'scene' | 'other' {
  if (domain === 'scene' || domain === 'script') return 'scene'
  if (Object.keys(data ?? {}).some((key) => SLIDER_KEYS.has(key))) return 'slider'
  if (TOGGLE_SERVICES.has(service)) return 'toggle'
  return 'button'
}

function send(path: string, body: unknown): void {
  void request(path, { method: 'POST', body: JSON.stringify(body) }).catch(() => {
    // Telemetria best effort: nessun effetto sul comando dell'utente.
  })
}

/** Registra l'intenzione; restituisce l'id dell'operazione o null se non osservabile. */
export function reportManualIntent(domain: string, service: string, data?: Record<string, unknown>): string | null {
  const targets = targetsOf(data)
  if (!targets.length) return null
  const operationId = newOperationId()
  send('/home-ai/v1/telemetry/manual-intents', {
    operation_id: operationId,
    interaction_id: `${operationId}-g`,
    control: controlOf(domain, service, data),
    domain,
    service,
    target_entity_ids: targets,
    requested: requestedOf(data),
    occurred_at: new Date().toISOString(),
  })
  return operationId
}

/** Esito visto dal client; il backend registra anche il suo (deduplicato per operazione). */
export function reportManualResult(operationId: string, result: 'accepted' | 'failed' | 'unknown', status?: number): void {
  send('/home-ai/v1/telemetry/manual-results', {
    operation_id: operationId,
    result,
    ...(status ? { ha_status: status } : {}),
  })
}
