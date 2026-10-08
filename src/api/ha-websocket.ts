import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { useDoorbellEvents } from '../store/doorbellEvents'
import { alarmTestNeedsSync, useAlarmTestStore } from '../store/alarmTest'
import { alarmApi, ApiError, haApi, kioskApi, type AlarmTestRemoteState } from './backend'
import { reportManualIntent, reportManualResult } from '../lib/manualTelemetry'

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

type HaStreamEvent = (
  | { type: 'snapshot'; entities: HassEntity[] }
  | { type: 'status'; connected: boolean; message?: string }
  | { type: 'delta'; changed: HassEntity[]; removed: string[] }
  | { type: 'error'; message: string }
  | { type: 'doorbell-test'; doorbellId: string }
  | { type: 'kiosk-command'; commandId: string; target: string; command: string; value?: number | string }
  | ({ type: 'alarm-test' } & AlarmTestRemoteState)
) & { haGeneration?: string }

const PROXY_POLL_MS = 4000
const ALARM_TEST_SYNC_MS = 1_500
/** Delta coalescing window: many SSE frames → one store update. */
const FLUSH_MS = 50

let eventSource: EventSource | null = null
let proxyPollTimer: ReturnType<typeof setInterval> | null = null
let proxyPollInFlight: Promise<void> | null = null
let proxyPollAbort: AbortController | null = null
let streamWatchdog: ReturnType<typeof setTimeout> | null = null
let streamInitialTimer: ReturnType<typeof setTimeout> | null = null
let streamRetryTimer: ReturnType<typeof setTimeout> | null = null
let manuallyClosed = false
let alarmSyncTimer: ReturnType<typeof setInterval> | null = null
let alarmSyncInFlight: Promise<void> | null = null

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
  if (event.haGeneration && event.haGeneration !== store.sourceGeneration) {
    resetDeltaBuffer()
    store.setSourceGeneration(event.haGeneration)
    if (useEntityStore.getState().sourceGeneration !== event.haGeneration) return
  }
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
  } else if (event.type === 'status') {
    store.setConnectionStatus(event.connected ? 'connected' : 'error', event.message)
  } else if (event.type === 'error') {
    store.setConnectionStatus('error', event.message)
  } else if (event.type === 'doorbell-test') {
    // Prova dal pannello desktop: ogni client connesso suona (tablet incluso).
    useDoorbellEvents.getState().triggerTest(event.doorbellId)
  } else if (event.type === 'alarm-test') {
    useAlarmTestStore.getState().sync(event)
  } else if (event.type === 'kiosk-command') {
    // Comando dalla regia (§4.5/§12): lo esegue solo il tablet bersaglio.
    void import('../lib/kioskDevice').then(async ({ executeKioskCommand, getKioskDeviceId, rememberKioskRestart, forgetKioskRestart }) => {
      const isKiosk = document.documentElement.classList.contains('kiosk-mode')
      if (!isKiosk) return
      const deviceId = getKioskDeviceId()
      if (event.target !== 'all' && event.target !== deviceId) return
      if (event.command === 'reload' || event.command === 'restart') {
        await kioskApi.ack({ deviceId, commandId: event.commandId, command: event.command, ok: true, status: 'accepted' })
        rememberKioskRestart(event.commandId, event.command)
      }
      const outcome = await executeKioskCommand(
        event.command as Parameters<typeof executeKioskCommand>[0],
        event.value,
      )
      // L'invio è un broadcast: senza questo riscontro la regia non saprebbe
      // mai se il comando è stato davvero eseguito.
      if (outcome.ok && (event.command === 'reload' || event.command === 'restart')) return
      if (!outcome.ok && (event.command === 'reload' || event.command === 'restart')) forgetKioskRestart()
      void kioskApi.ack({
        commandId: event.commandId,
        deviceId,
        command: event.command,
        ok: outcome.ok,
        ...(outcome.ok ? {} : { reason: outcome.reason }),
      }).catch(() => {})
    }).catch(() => {})
  }
}

// ── REST poll fallback (via backend proxy) ───────────────────────────────────

function pollAlarmTest(): Promise<void> {
  if (alarmSyncInFlight) return alarmSyncInFlight
  const task = alarmApi.testStatus()
    .then((remote) => {
      const store = useAlarmTestStore.getState()
      if (alarmTestNeedsSync(store.testId, remote)) store.sync(remote)
    })
    .catch(() => {})
    .finally(() => {
      if (alarmSyncInFlight === task) alarmSyncInFlight = null
    })
  alarmSyncInFlight = task
  return task
}

function startAlarmTestSync(): void {
  if (alarmSyncTimer) return
  void pollAlarmTest()
  alarmSyncTimer = setInterval(() => { void pollAlarmTest() }, ALARM_TEST_SYNC_MS)
}

function stopAlarmTestSync(): void {
  if (alarmSyncTimer) clearInterval(alarmSyncTimer)
  alarmSyncTimer = null
}

function pollProxyStates(): Promise<void> {
  if (proxyPollInFlight) return proxyPollInFlight
  const controller = new AbortController()
  const generation = useEntityStore.getState().sourceGeneration
  proxyPollAbort = controller
  const task = (async () => {
    try {
      const states = await haApi.states(controller.signal) as HassEntity[]
      if (controller.signal.aborted || generation !== useEntityStore.getState().sourceGeneration) return
      const next = states.reduce<HassEntities>((acc, entity) => {
        acc[entity.entity_id] = entity
        return acc
      }, {})
      useEntityStore.getState().setEntities(next)
      useEntityStore.getState().setConnectionStatus('connected')
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : 'Home Assistant non raggiungibile'
      useEntityStore.getState().setConnectionStatus('error', message)
    }
  })().finally(() => {
    if (proxyPollAbort === controller) proxyPollAbort = null
    if (proxyPollInFlight === task) proxyPollInFlight = null
  })
  proxyPollInFlight = task
  return task
}

export async function connectHAProxy(): Promise<void> {
  manuallyClosed = false
  startAlarmTestSync()
  if (proxyPollTimer) return
  useEntityStore.getState().setConnectionStatus('connecting')
  proxyPollTimer = setInterval(() => {
    pollProxyStates().catch(() => {})
  }, PROXY_POLL_MS)
  await pollProxyStates()
}

export function disconnectHAProxy() {
  if (proxyPollTimer) {
    clearInterval(proxyPollTimer)
    proxyPollTimer = null
  }
  proxyPollAbort?.abort()
  proxyPollAbort = null
  proxyPollInFlight = null
  useEntityStore.getState().setConnectionStatus('disconnected')
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
  let disabled = false
  try { disabled = localStorage.getItem('myhome.haStream') === 'off' } catch { /* optional storage */ }
  if (typeof EventSource === 'undefined' || disabled) {
    await connectHAProxy()
    return
  }
  if (eventSource) return
  if (streamRetryTimer) clearTimeout(streamRetryTimer)
  streamRetryTimer = null
  if (!proxyPollTimer) useEntityStore.getState().setConnectionStatus('connecting')

  const es = new EventSource('/api/ha/stream')
  eventSource = es
  const toPoll = () => {
    if (eventSource !== es || manuallyClosed) return
    es.close()
    eventSource = null
    if (streamWatchdog) clearTimeout(streamWatchdog)
    if (streamInitialTimer) clearTimeout(streamInitialTimer)
    streamWatchdog = streamInitialTimer = null
    resetDeltaBuffer()
    void connectHAProxy()
    streamRetryTimer = setTimeout(() => { void connectHAStream() }, 15_000)
  }
  const watch = (timeout = 35_000) => {
    if (streamWatchdog) clearTimeout(streamWatchdog)
    streamWatchdog = setTimeout(toPoll, timeout)
  }
  streamInitialTimer = setTimeout(toPoll, 6000)
  es.addEventListener('ready', () => {
    if (eventSource === es) watch()
  })
  es.addEventListener('ping', () => {
    if (eventSource === es) watch()
  })
  es.addEventListener('states', (event) => {
    if (eventSource !== es || manuallyClosed) return
    try {
      const parsed = JSON.parse((event as MessageEvent).data) as HaStreamEvent
      if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return
      if (['snapshot', 'delta', 'status', 'error'].includes(parsed.type)) {
        if (streamInitialTimer) clearTimeout(streamInitialTimer)
        streamInitialTimer = null
        if (proxyPollTimer) disconnectHAProxy()
        watch()
      }
      if (parsed.type === 'alarm-test') stopAlarmTestSync()
      applyStreamEvent(parsed)
    } catch { /* malformed frames must not count as healthy data */ }
  })
  es.onerror = () => {
    if (eventSource !== es || manuallyClosed) return
    useEntityStore.getState().setConnectionStatus('connecting')
    startAlarmTestSync()
    watch(6000)
  }
}

export function disconnectHAStream() {
  manuallyClosed = true
  if (streamWatchdog) clearTimeout(streamWatchdog)
  if (streamInitialTimer) clearTimeout(streamInitialTimer)
  if (streamRetryTimer) clearTimeout(streamRetryTimer)
  streamWatchdog = streamInitialTimer = streamRetryTimer = null
  stopAlarmTestSync()
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
  // HOME AI CORE osserva il gesto su un canale separato: il comando parte
  // comunque, identico, anche se la telemetria non è disponibile.
  const operationId = reportManualIntent(domain, service, serviceData)
  try {
    await haApi.service(domain, service, serviceData, operationId)
    if (operationId) reportManualResult(operationId, 'accepted')
  } catch (error) {
    if (operationId) {
      const status = error instanceof ApiError ? error.status : undefined
      reportManualResult(operationId, status && status < 500 ? 'failed' : 'unknown', status)
    }
    throw error
  }
}
