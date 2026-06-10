import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { haApi } from './backend'

/**
 * Live Home Assistant data for every client (kiosk AND desktop).
 *
 * The browser never holds the HA token: the backend keeps the only
 * authenticated connection to HA (WebSocket push with poll fallback, see
 * backend/src/lib/ha-stream.ts) and fans out deltas over SSE. Service calls
 * always go through the backend proxy.
 *
 * Fallback chain here: SSE stream → REST poll via the backend proxy.
 * Set localStorage `myhome.haStream` to `off` to force the poll path.
 */

type HaStreamEvent =
  | { type: 'snapshot'; entities: HassEntity[] }
  | { type: 'delta'; changed: HassEntity[]; removed: string[] }
  | { type: 'error'; message: string }

const PROXY_POLL_MS = 4000
/** Delta coalescing window: many SSE frames → one store update. */
const FLUSH_MS = 50

let eventSource: EventSource | null = null
let proxyPollTimer: ReturnType<typeof setInterval> | null = null
let manuallyClosed = false

// ── Delta coalescing ─────────────────────────────────────────────────────────
// The WS-backed stream can push several frames per second on a busy HA; batch
// them so the store re-notifies subscribers at most once per window.

let pendingChanged = new Map<string, HassEntity>()
let pendingRemoved = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushDeltas(): void {
  flushTimer = null
  if (pendingChanged.size === 0 && pendingRemoved.size === 0) return
  const changed = [...pendingChanged.values()]
  const removed = [...pendingRemoved]
  pendingChanged = new Map()
  pendingRemoved = new Set()
  useEntityStore.getState().applyEntityDelta(changed, removed)
}

function resetDeltaBuffer(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  pendingChanged = new Map()
  pendingRemoved = new Set()
}

function applyStreamEvent(event: HaStreamEvent): void {
  const store = useEntityStore.getState()
  if (event.type === 'snapshot') {
    resetDeltaBuffer()
    const next: HassEntities = {}
    for (const entity of event.entities) next[entity.entity_id] = entity
    store.setEntities(next)
    store.setConnectionStatus('connected')
  } else if (event.type === 'delta') {
    for (const entity of event.changed) {
      pendingChanged.set(entity.entity_id, entity)
      pendingRemoved.delete(entity.entity_id)
    }
    for (const id of event.removed) {
      pendingRemoved.add(id)
      pendingChanged.delete(id)
    }
    if (!flushTimer) flushTimer = setTimeout(flushDeltas, FLUSH_MS)
    store.setConnectionStatus('connected')
  } else if (event.type === 'error') {
    store.setConnectionStatus('error', event.message)
  }
}

// ── REST poll fallback (via backend proxy) ───────────────────────────────────

async function pollProxyStates(): Promise<void> {
  try {
    const states = await haApi.states() as HassEntity[]
    const next = states.reduce<HassEntities>((acc, entity) => {
      acc[entity.entity_id] = entity
      return acc
    }, {})
    useEntityStore.getState().setEntities(next)
    useEntityStore.getState().setConnectionStatus('connected')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Home Assistant non raggiungibile'
    useEntityStore.getState().setConnectionStatus('error', message)
  }
}

export async function connectHAProxy(): Promise<void> {
  manuallyClosed = false
  if (proxyPollTimer) return
  useEntityStore.getState().setConnectionStatus('connecting')
  await pollProxyStates()
  proxyPollTimer = setInterval(() => {
    pollProxyStates().catch(() => {})
  }, PROXY_POLL_MS)
}

export function disconnectHAProxy() {
  if (proxyPollTimer) {
    clearInterval(proxyPollTimer)
    proxyPollTimer = null
    useEntityStore.getState().setConnectionStatus('disconnected')
  }
}

// ── Primary connection: backend SSE stream ───────────────────────────────────

/**
 * Subscribes to the backend SSE entity stream. Falls back automatically to
 * REST polling if EventSource is unsupported, disabled, or the stream never
 * delivers data (e.g. a buffering WebView). EventSource reconnects on its own
 * and resumes from `Last-Event-ID`, so brief drops don't cost a snapshot.
 */
export async function connectHAStream(): Promise<void> {
  manuallyClosed = false
  const disabled = typeof localStorage !== 'undefined' && localStorage.getItem('myhome.haStream') === 'off'
  if (typeof EventSource === 'undefined' || disabled) {
    await connectHAProxy()
    return
  }
  if (eventSource) return
  useEntityStore.getState().setConnectionStatus('connecting')

  let gotData = false
  const es = new EventSource('/api/ha/stream')
  eventSource = es

  const toPoll = () => {
    if (eventSource !== es) return
    es.close()
    eventSource = null
    connectHAProxy().catch(() => {})
  }
  const fallback = setTimeout(() => { if (!gotData) toPoll() }, 6000)

  es.addEventListener('states', (event) => {
    gotData = true
    clearTimeout(fallback)
    try {
      applyStreamEvent(JSON.parse((event as MessageEvent).data) as HaStreamEvent)
    } catch {
      // ignore a malformed frame; the next delta corrects the store
    }
  })
  es.onerror = () => {
    if (!gotData) {
      clearTimeout(fallback)
      toPoll()
    } else {
      // transient drop — EventSource auto-reconnects; surface as syncing
      useEntityStore.getState().setConnectionStatus('connecting')
    }
  }
}

export function disconnectHAStream() {
  manuallyClosed = true
  resetDeltaBuffer()
  if (eventSource) { eventSource.close(); eventSource = null }
  disconnectHAProxy()
}

export function isHAManuallyClosed(): boolean {
  return manuallyClosed
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Calls an HA service through the backend proxy (the only action path: the
 * token stays server-side and the tablet allowlist applies uniformly).
 */
export async function callService(
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
): Promise<void> {
  await haApi.service(domain, service, serviceData)
}
