import { getHABaseUrl, getHAConfig } from './ha-config.js'
import { getHaWsState, startEntityFeed, stopEntityFeed } from './ha-ws.js'

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

export type HaStreamEvent =
  | { type: 'snapshot'; entities: HaEntityLike[] }
  | { type: 'delta'; changed: HaEntityLike[]; removed: string[] }
  | { type: 'error'; message: string }

type Subscriber = (event: HaStreamEvent, id: number) => void

const POLL_MS = Math.max(500, Number(process.env.MYHOME_HA_POLL_MS ?? 1500))
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

let eventSeq = 0
let lastEventAt: string | null = null
/** Recent deltas only — a snapshot resets it (older deltas become irrelevant). */
let ring: { id: number; event: HaStreamEvent }[] = []

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

// ── Poll fallback (the original loop, unchanged in spirit) ──────────────────

async function fetchStates(): Promise<HaEntityLike[]> {
  const { haToken } = await getHAConfig()
  if (!haToken) throw new Error('Home Assistant token missing')
  const res = await fetch(`${await getHABaseUrl()}/api/states`, {
    headers: { Authorization: `Bearer ${haToken}` },
  })
  if (!res.ok) throw new Error(`Home Assistant states returned ${res.status}`)
  return await res.json() as HaEntityLike[]
}

async function poll(): Promise<void> {
  if (polling) return
  polling = true
  try {
    const states = await fetchStates()
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
    pushEvent({ type: 'error', message: error instanceof Error ? error.message : 'Home Assistant unreachable' })
  } finally {
    polling = false
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
