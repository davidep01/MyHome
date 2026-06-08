import { getHABaseUrl, getHAConfig } from './ha-config.js'

/**
 * Backend-held Home Assistant state stream.
 *
 * One server-side poll loop fetches `/api/states` (the HA token never leaves the
 * server) and fans out *deltas* to every connected client over SSE. This
 * replaces N browsers each polling HA directly:
 *   - the token stays backend-side (kiosk security),
 *   - clients get near-real-time pushes instead of a 4s full re-poll,
 *   - optimistic UI no longer flickers (only changed entities are pushed).
 *
 * The loop runs only while at least one client is subscribed.
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

type Subscriber = (event: HaStreamEvent) => void

const POLL_MS = Math.max(500, Number(process.env.MYHOME_HA_POLL_MS ?? 1500))

const subscribers = new Set<Subscriber>()
let snapshot = new Map<string, HaEntityLike>()
let timer: ReturnType<typeof setInterval> | null = null
let polling = false

async function fetchStates(): Promise<HaEntityLike[]> {
  const { haToken } = await getHAConfig()
  if (!haToken) throw new Error('Home Assistant token missing')
  const res = await fetch(`${await getHABaseUrl()}/api/states`, {
    headers: { Authorization: `Bearer ${haToken}` },
  })
  if (!res.ok) throw new Error(`Home Assistant states returned ${res.status}`)
  return await res.json() as HaEntityLike[]
}

function broadcast(event: HaStreamEvent): void {
  for (const sub of subscribers) {
    try { sub(event) } catch { /* a broken subscriber must not stop the loop */ }
  }
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
    if (changed.length || removed.length) broadcast({ type: 'delta', changed, removed })
  } catch (error) {
    broadcast({ type: 'error', message: error instanceof Error ? error.message : 'Home Assistant unreachable' })
  } finally {
    polling = false
  }
}

function ensurePolling(): void {
  if (timer) return
  void poll() // prime immediately
  timer = setInterval(() => { void poll() }, POLL_MS)
}

function stopPollingIfIdle(): void {
  if (subscribers.size === 0 && timer) {
    clearInterval(timer)
    timer = null
    snapshot = new Map()
  }
}

/**
 * Register a subscriber. A late joiner with a populated snapshot gets it
 * immediately; the very first subscriber is primed by the initial poll, whose
 * delta (prev empty → every entity "changed") acts as a full snapshot.
 * Returns an unsubscribe function.
 */
export function subscribeHaStream(sub: Subscriber): () => void {
  subscribers.add(sub)
  if (snapshot.size > 0) sub({ type: 'snapshot', entities: [...snapshot.values()] })
  ensurePolling()
  return () => {
    subscribers.delete(sub)
    stopPollingIfIdle()
  }
}
