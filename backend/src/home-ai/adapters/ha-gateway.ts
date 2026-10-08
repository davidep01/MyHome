import { CoreError, physicalExecutionDisabled } from '../domain/errors.js'
import { redactAll } from '../domain/redact.js'

/**
 * Gateway Home Assistant in SOLA LETTURA (specifica §5, §6).
 *
 * È un'allowlist, non una lista di divieti: ogni richiesta che non
 * corrisponde esattamente a una delle forme ammesse viene rifiutata PRIMA di
 * qualunque I/O, con errore `PHYSICAL_EXECUTION_DISABLED` e voce di audit
 * priva di segreti. `call_service`, `fire_event`, scritture `/api/states`,
 * servizi REST e MQTT non hanno un percorso.
 *
 * Il token resta in questa chiusura: agenti, miner, simulatore e reasoner
 * ricevono solo dati già letti, mai il gateway.
 */

const ENTITY = '[a-z_][a-z0-9_]*\\.[a-z0-9_]+'
const ISO = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|%2B\\d{2}%3A\\d{2}|[+-]\\d{2}:\\d{2})'

const HTTP_ALLOWLIST: RegExp[] = [
  /^\/api\/states$/,
  new RegExp(`^/api/states/${ENTITY}$`),
  /^\/api\/config$/,
  new RegExp(`^/api/calendars/calendar\\.[a-z0-9_]+\\?start=${ISO}&end=${ISO}$`),
]

const WS_ALLOWED_TYPES = new Set(['auth', 'get_states', 'get_config', 'ping', 'subscribe_events', 'unsubscribe_events'])

export type GatewayAudit = (entry: { action: string; outcome: 'allowed' | 'blocked'; detail: string }) => void

export interface GatewayDeps {
  baseUrl: () => Promise<string>
  token: () => Promise<string>
  fetchImpl?: typeof fetch
  audit: GatewayAudit
  timeoutMs?: number
}

export function isAllowedHttpRead(method: string, pathWithQuery: string): boolean {
  return method.toUpperCase() === 'GET' && HTTP_ALLOWLIST.some((pattern) => pattern.test(pathWithQuery))
}

/** Controllo dei messaggi WebSocket in uscita: solo letture e sottoscrizioni proprie. */
export function assertAllowedWsMessage(message: Record<string, unknown>, ownSubscriptions: Set<number>): void {
  const type = String(message.type ?? '')
  if (!WS_ALLOWED_TYPES.has(type)) throw physicalExecutionDisabled(`ws:${type || 'senza-tipo'}`)
  if (type === 'subscribe_events' && message.event_type !== 'state_changed') {
    throw physicalExecutionDisabled(`ws:subscribe_events:${String(message.event_type).slice(0, 40)}`)
  }
  if (type === 'unsubscribe_events' && !ownSubscriptions.has(Number(message.subscription))) {
    throw new CoreError('FORBIDDEN_SCOPE', 'Sottoscrizione non appartenente al gateway.')
  }
  // Nessun comando incapsulato: un messaggio di lettura non porta servizi o payload esecutivi.
  for (const key of ['service', 'service_data', 'domain', 'event_data', 'target']) {
    if (key in message) throw physicalExecutionDisabled(`ws:${type}:${key}`)
  }
}

export class HAReadGateway {
  private readonly fetchImpl: typeof fetch
  constructor(private readonly deps: GatewayDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  /** Unica porta HTTP verso HA. Qualunque metodo diverso da GET è rifiutato prima dell'I/O. */
  async request(method: string, pathWithQuery: string, body?: unknown): Promise<unknown> {
    if (!isAllowedHttpRead(method, pathWithQuery) || body !== undefined) {
      this.deps.audit({ action: `ha.http.${method.toUpperCase()}`, outcome: 'blocked', detail: redactAll(pathWithQuery.split('?')[0]).slice(0, 120) })
      throw physicalExecutionDisabled(`http:${method.toUpperCase()} ${pathWithQuery.split('?')[0]}`)
    }
    const base = (await this.deps.baseUrl()).replace(/\/$/, '')
    const token = await this.deps.token()
    if (!base || !token) throw new CoreError('SOURCE_UNAVAILABLE', 'Home Assistant non configurato.')
    let res: Response
    try {
      res = await this.fetchImpl(`${base}${pathWithQuery}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(this.deps.timeoutMs ?? 10_000),
      })
    } catch (error) {
      throw new CoreError('SOURCE_UNAVAILABLE', 'Home Assistant non raggiungibile.', [redactAll(error instanceof Error ? error.name : 'errore')])
    }
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => undefined)
      throw new CoreError('SOURCE_UNAVAILABLE', 'Credenziale Home Assistant non valida.')
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined)
      throw new CoreError('SOURCE_UNAVAILABLE', `Home Assistant ha risposto ${res.status}.`)
    }
    const text = await res.text()
    if (text.length > 8 * 1_024 * 1_024) throw new CoreError('SOURCE_UNAVAILABLE', 'Risposta troppo grande.')
    return JSON.parse(text) as unknown
  }

  async readStates(): Promise<unknown> { return this.request('GET', '/api/states') }
  async readState(entityId: string): Promise<unknown> { return this.request('GET', `/api/states/${entityId}`) }

  async readCalendar(entityId: string, start: Date, end: Date): Promise<unknown> {
    const span = end.getTime() - start.getTime()
    if (span <= 0 || span > 120 * 86_400_000) throw new CoreError('VALIDATION_ERROR', 'Intervallo di calendario non valido.')
    return this.request('GET', `/api/calendars/${entityId}?start=${start.toISOString()}&end=${end.toISOString()}`)
  }
}
