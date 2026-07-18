import { getHABaseUrl, getHAConfig } from './ha-config.js'
import { closeHaWs, getHaWsState, startEntityFeed, stopEntityFeed } from './ha-ws.js'
import { advertisedArtworkSources } from './ha-media.js'

/**
 * Backend-held Home Assistant state stream.
 *
 * Primary path: ONE WebSocket to HA (`subscribe_entities`, see ha-ws.ts) pushes
 * deltas with near-zero latency; this module fans them out to every connected
 * client over SSE. The HA token never leaves the server.
 *
 * Fallback path: the original server-side poll of `/api/states`. It kicks in
 * automatically while the WS is down (HA restarting, old Node without native
 * WebSocket, `MYHOME_HA_STREAM=poll` to force it) and stops as soon as the WS
 * recovers — the snapshot map is shared, so the handover emits clean deltas.
 *
 * Events carry a monotonic id and recent deltas are kept in a ring buffer, so
 * an SSE client reconnecting with `Last-Event-ID` resumes without a snapshot.
 *
 * Everything runs only while at least one client is subscribed.
 */

export interface HaEntityLike {
  entity_id: string
  state: string
  attributes?: Record<string, unknown>
  last_changed?: string
  last_updated?: string
  context?: unknown
}

export type AlarmTestScenario = 'intrusion' | 'siren' | 'smoke'

export interface ActiveAlarmTest {
  id: string
  scenario: AlarmTestScenario
  startedAt: string
  expiresAt: string
}

export type AlarmTestStreamEvent =
  | ({ type: 'alarm-test'; active: true; serverNow: string } & ActiveAlarmTest)
  | { type: 'alarm-test'; active: false; id?: string; serverNow: string }

export type HaStreamEvent =
  | { type: 'snapshot'; entities: HaEntityLike[] }
  | { type: 'delta'; changed: HaEntityLike[]; removed: string[] }
  | { type: 'error'; message: string }
  /** Prova campanello (Funzioni → Campanelli → Prova): suona su TUTTI i client. */
  | { type: 'doorbell-test'; doorbellId: string }
  /** Comando dalla regia a un tablet (§4.5/§12): ricarica, schermo, TTS… */
  | { type: 'kiosk-command'; target: string; command: string; value?: number | string }
  /** Simulazione emergenza coordinata dal server su tutti i kiosk. */
  | AlarmTestStreamEvent

type Subscriber = (event: HaStreamEvent, id: number) => void

function boundedMilliseconds(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

const POLL_MS = boundedMilliseconds(process.env.MYHOME_HA_POLL_MS, 1_500, 500, 60_000)
const POLL_TIMEOUT_MS = boundedMilliseconds(process.env.MYHOME_HA_POLL_TIMEOUT_MS, 8_000, 1_000, 30_000)
const FORCE_POLL = process.env.MYHOME_HA_STREAM === 'poll'
/** How long we give the WS to come up before starting the poll fallback. */
const WS_GRACE_MS = 3000
const RING_MAX = 400

const subscribers = new Set<Subscriber>()
let snapshot = new Map<string, HaEntityLike>()

let mode: 'idle' | 'ws' | 'poll' = 'idle'
let feedStarted = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let polling = false
let wsGraceTimer: ReturnType<typeof setTimeout> | null = null
let connectionGeneration = 0
let pollAttemptId = 0

let eventSeq = 0
let lastEventAt: string | null = null
/** Recent deltas only — a snapshot resets it (older deltas become irrelevant). */
let ring: { id: number; event: HaStreamEvent }[] = []
let activeAlarmTest: ActiveAlarmTest | null = null
let alarmTestTimer: ReturnType<typeof setTimeout> | null = null

function broadcast(event: HaStreamEvent, id: number): void {
  for (const sub of subscribers) {
    try { sub(event, id) } catch { /* a broken subscriber must not stop the loop */ }
  }
}

function pushEvent(event: HaStreamEvent): void {
  eventSeq += 1
  lastEventAt = new Date().toISOString()
  if (event.type === 'delta') {
    ring.push({ id: eventSeq, event })
    if (ring.length > RING_MAX) ring = ring.slice(ring.length - RING_MAX)
  } else if (event.type === 'snapshot') {
    ring = []
  }
  broadcast(event, eventSeq)
}

/**
 * Suonata di prova: viaggia sul canale dati esistente (lo stream HA, l'unico
 * accessibile anche dal tablet) come evento one-shot — fuori dal ring buffer,
 * una prova non deve ri-suonare dopo una riconnessione.
 */
export function broadcastDoorbellTest(doorbellId: string): void {
  eventSeq += 1
  broadcast({ type: 'doorbell-test', doorbellId }, eventSeq)
}

/**
 * Comando remoto per i tablet: stesso canale one-shot della prova campanello
 * (fuori dal ring buffer — un comando non deve rieseguirsi a una riconnessione).
 */
export function broadcastKioskCommand(target: string, command: string, value?: number | string): void {
  eventSeq += 1
  broadcast({ type: 'kiosk-command', target, command, ...(value !== undefined ? { value } : {}) }, eventSeq)
}

function activeAlarmTestEvent(test: ActiveAlarmTest): AlarmTestStreamEvent {
  return { type: 'alarm-test', active: true, ...test, serverNow: new Date().toISOString() }
}

/** Starts (or replaces) the shared emergency simulation for every kiosk. */
export function startSharedAlarmTest(scenario: AlarmTestScenario, durationMs = 20_000): ActiveAlarmTest {
  if (alarmTestTimer) clearTimeout(alarmTestTimer)
  const now = Date.now()
  const test: ActiveAlarmTest = {
    id: `alarm-test-${now}-${Math.random().toString(36).slice(2, 8)}`,
    scenario,
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + durationMs).toISOString(),
  }
  activeAlarmTest = test
  eventSeq += 1
  broadcast(activeAlarmTestEvent(test), eventSeq)
  alarmTestTimer = setTimeout(() => stopSharedAlarmTest(test.id), durationMs)
  return test
}

/** Stops the current simulation and synchronizes dismissal across clients. */
export function stopSharedAlarmTest(expectedId?: string): boolean {
  if (!activeAlarmTest || (expectedId && activeAlarmTest.id !== expectedId)) return false
  const stoppedId = activeAlarmTest.id
  activeAlarmTest = null
  if (alarmTestTimer) clearTimeout(alarmTestTimer)
  alarmTestTimer = null
  eventSeq += 1
  broadcast({ type: 'alarm-test', active: false, id: stoppedId, serverNow: new Date().toISOString() }, eventSeq)
  return true
}

export function getSharedAlarmTest(): ({ active: true; serverNow: string } & ActiveAlarmTest) | { active: false; serverNow: string } {
  if (!activeAlarmTest) return { active: false, serverNow: new Date().toISOString() }
  if (Date.parse(activeAlarmTest.expiresAt) <= Date.now()) {
    stopSharedAlarmTest(activeAlarmTest.id)
    return { active: false, serverNow: new Date().toISOString() }
  }
  return { active: true, ...activeAlarmTest, serverNow: new Date().toISOString() }
}

// ── Poll fallback (the original loop, unchanged in spirit) ──────────────────

export async function fetchHAStatesWithTimeout(
  baseUrl: string,
  token: string,
  timeoutMs = POLL_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<HaEntityLike[]> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/states`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Home Assistant states returned ${res.status}`)
  const body = await res.json() as unknown
  if (!Array.isArray(body)) throw new Error('Home Assistant states response invalid')
  return body as HaEntityLike[]
}

async function fetchStates(): Promise<HaEntityLike[]> {
  const { haToken } = await getHAConfig()
  if (!haToken) throw new Error('Home Assistant token missing')
  return fetchHAStatesWithTimeout(await getHABaseUrl(), haToken)
}

async function poll(): Promise<void> {
  if (polling) return
  polling = true
  const attemptId = ++pollAttemptId
  const generation = connectionGeneration
  try {
    const states = await fetchStates()
    if (generation !== connectionGeneration || attemptId !== pollAttemptId || mode !== 'poll') return
    const next = new Map(states.map((entity) => [entity.entity_id, entity]))

    const changed: HaEntityLike[] = []
    for (const [id, entity] of next) {
      const prev = snapshot.get(id)
      if (!prev || prev.last_updated !== entity.last_updated || prev.state !== entity.state) {
        changed.push(entity)
      }
    }
    const removed: string[] = []
    for (const id of snapshot.keys()) if (!next.has(id)) removed.push(id)

    snapshot = next
    if (changed.length || removed.length) pushEvent({ type: 'delta', changed, removed })
  } catch (error) {
    if (generation === connectionGeneration && attemptId === pollAttemptId && mode === 'poll') {
      pushEvent({ type: 'error', message: error instanceof Error ? error.message : 'Home Assistant unreachable' })
    }
  } finally {
    if (attemptId === pollAttemptId) polling = false
  }
}

function startPolling(): void {
  if (pollTimer) return
  mode = 'poll'
  void poll() // prime immediately
  pollTimer = setInterval(() => { void poll() }, POLL_MS)
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

// ── WS-first feed ────────────────────────────────────────────────────────────

function ensureFeed(): void {
  if (subscribers.size === 0) return
  if (FORCE_POLL) {
    startPolling()
    return
  }
  if (feedStarted) return
  feedStarted = true

  startEntityFeed({
    onSnapshot: (entities) => {
      if (wsGraceTimer) { clearTimeout(wsGraceTimer); wsGraceTimer = null }
      stopPolling()
      // A REST request may already be in flight. Invalidate its attempt before
      // publishing the fresher WS snapshot so its late response cannot win.
      pollAttemptId += 1
      polling = false
      mode = 'ws'
      snapshot = new Map(entities.map((entity) => [entity.entity_id, entity]))
      pushEvent({ type: 'snapshot', entities })
    },
    onDelta: (changed, removed) => {
      for (const entity of changed) snapshot.set(entity.entity_id, entity)
      for (const id of removed) snapshot.delete(id)
      pushEvent({ type: 'delta', changed, removed })
    },
    onDown: () => {
      // The WS layer keeps retrying with backoff; meanwhile clients must not
      // starve — fall back to the poll loop until the next onSnapshot.
      if (subscribers.size > 0) startPolling()
    },
  })

  // No snapshot within the grace window (HA slow, WS blocked, …) → poll now.
  wsGraceTimer = setTimeout(() => {
    wsGraceTimer = null
    if (mode !== 'ws' && subscribers.size > 0) startPolling()
  }, WS_GRACE_MS)
}

function teardownIfIdle(): void {
  if (subscribers.size > 0) return
  connectionGeneration += 1
  pollAttemptId += 1
  polling = false
  stopPolling()
  if (wsGraceTimer) { clearTimeout(wsGraceTimer); wsGraceTimer = null }
  if (feedStarted) {
    stopEntityFeed()
    feedStarted = false
  }
  mode = 'idle'
  snapshot = new Map()
  ring = []
}

/**
 * Drops every value tied to the previous HA URL/token and reconnects the live
 * feed without disconnecting browser SSE subscribers. In-flight polls are
 * generation-gated, so a late response from the old house cannot repopulate
 * the snapshot after this reset.
 */
export function invalidateHAConnection(): void {
  connectionGeneration += 1
  pollAttemptId += 1
  stopPolling()
  polling = false
  if (wsGraceTimer) { clearTimeout(wsGraceTimer); wsGraceTimer = null }
  if (feedStarted) stopEntityFeed()
  closeHaWs()
  feedStarted = false
  mode = 'idle'
  snapshot = new Map()
  ring = []

  if (subscribers.size > 0) {
    pushEvent({ type: 'snapshot', entities: [] })
    ensureFeed()
  }
}

/**
 * Register a subscriber.
 * - With `sinceId` (SSE `Last-Event-ID`) and an intact ring → replay only the
 *   missed deltas.
 * - Otherwise a late joiner with a populated snapshot gets it immediately; the
 *   very first subscriber is primed by the WS snapshot (or the first poll).
 * Returns an unsubscribe function.
 */
export function subscribeHaStream(sub: Subscriber, sinceId?: number): () => void {
  subscribers.add(sub)

  const canResume = sinceId !== undefined
    && sinceId <= eventSeq
    && (ring.length === 0 ? sinceId === eventSeq : sinceId >= ring[0].id - 1)
  if (canResume) {
    for (const entry of ring) if (entry.id > sinceId) sub(entry.event, entry.id)
  } else if (snapshot.size > 0) {
    sub({ type: 'snapshot', entities: [...snapshot.values()] }, eventSeq)
  }

  const alarmTest = getSharedAlarmTest()
  if (alarmTest.active) sub({ type: 'alarm-test', ...alarmTest }, eventSeq)

  ensureFeed()
  return () => {
    subscribers.delete(sub)
    teardownIfIdle()
  }
}

/** Live bridge diagnostics — consumed by /api/system/status (regia). */
export function getStreamStats() {
  return {
    mode,
    wsState: getHaWsState(),
    subscribers: subscribers.size,
    entities: snapshot.size,
    pollMs: POLL_MS,
    lastEventId: eventSeq,
    lastEventAt,
  }
}

/** Public artwork may be proxied only after HA itself advertised the exact URL. */
export function isKnownHAImageSource(source: string): boolean {
  if (!source || source.length > 2_048) return false
  for (const entity of snapshot.values()) {
    if (advertisedArtworkSources(entity.attributes).includes(source)) return true
  }
  return false
}

const DOORBELL_ACTIVE_STATES = new Set(['on', 'ringing', 'detected', 'pressed'])

/**
 * Returns a stable key only for a very recent, server-observed doorbell event.
 * It is the trust token for privacy-sensitive Vision calls: a kiosk session
 * cannot manufacture it, and every client observing the same ring gets the
 * same key for provider deduplication.
 */
export function recentDoorbellActivityKey(entityId: string, maxAgeMs = 30_000): string | null {
  const entity = snapshot.get(entityId)
  if (!entity) return null
  const eventEntity = entityId.startsWith('event.')
  if (!eventEntity && !DOORBELL_ACTIVE_STATES.has(entity.state)) return null
  const timestamps = [entity.last_changed, entity.last_updated]
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite)
  if (timestamps.length === 0) return null
  const changedAt = Math.max(...timestamps)
  const age = Date.now() - changedAt
  if (age < -5_000 || age > maxAgeMs) return null
  const contextId = typeof entity.context === 'object' && entity.context !== null
    ? (entity.context as { id?: unknown }).id
    : undefined
  const eventKey = typeof contextId === 'string' && contextId ? contextId : new Date(changedAt).toISOString()
  return `${entityId}:${eventKey}`
}
