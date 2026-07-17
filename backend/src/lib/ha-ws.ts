import { getHAConfig, getHAWebSocketUrl } from './ha-config.js'
import { applyCompressedEvent, type CompressedStatesEvent } from './ha-ws-codec.js'
import type { HaEntityLike } from './ha-stream.js'

/**
 * Minimal Home Assistant WebSocket client on Node's native WebSocket (≥22).
 * Zero dependencies: auth handshake, id-correlated commands, subscribe_entities
 * with compressed-diff parsing (ha-ws-codec.ts), ping heartbeat and
 * exponential-backoff reconnect.
 *
 * The socket lives only while an entity feed is active (or a command is in
 * flight), so the backend never holds an idle connection.
 */

// ── Native WebSocket (structural types; no DOM lib in this tsconfig) ────────

interface WsLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void
}

function nativeWebSocket(): (new (url: string) => WsLike) | null {
  const ctor = (globalThis as { WebSocket?: new (url: string) => WsLike }).WebSocket
  return typeof ctor === 'function' ? ctor : null
}

// ── Client state ─────────────────────────────────────────────────────────────

export type HaWsState = 'idle' | 'connecting' | 'connected'

export interface EntityFeedHandlers {
  /** First event after (re)subscribe: the complete entity set. */
  onSnapshot: (entities: HaEntityLike[]) => void
  onDelta: (changed: HaEntityLike[], removed: string[]) => void
  /** Socket lost (will keep retrying with backoff while the feed is active). */
  onDown: (reason: string) => void
}

const COMMAND_TIMEOUT_MS = 10_000
const AUTH_HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_PREAUTH_QUEUE = 256
const PING_INTERVAL_MS = 30_000
const PONG_TIMEOUT_MS = 10_000
const MAX_RETRY_DELAY_MS = 30_000

let socket: WsLike | null = null
let state: HaWsState = 'idle'
let msgId = 1
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
const subscriptions = new Map<number, {
  onEvent: (event: unknown) => void
  onError?: (error: Error) => void
}>()
/** Commands issued before auth completes, flushed on auth_ok. */
const sendQueue = new Map<number, string>()

let feed: EntityFeedHandlers | null = null
let feedSubId: number | null = null
let feedPrimed = false
let entityMap = new Map<string, HaEntityLike>()

let retryAttempt = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null
let pongTimer: ReturnType<typeof setTimeout> | null = null
let handshakeTimer: ReturnType<typeof setTimeout> | null = null
let manuallyClosed = false
let connectPromise: Promise<void> | null = null
let connectionGeneration = 0

export function getHaWsState(): HaWsState {
  return state
}

function nextId(): number {
  return msgId++
}

function rawSend(payload: Record<string, unknown>): boolean {
  const text = JSON.stringify(payload)
  if (socket && state === 'connected') {
    socket.send(text)
    return true
  }
  const id = Number(payload.id)
  if (!Number.isSafeInteger(id) || id < 1) return false
  if (!sendQueue.has(id) && sendQueue.size >= MAX_PREAUTH_QUEUE) return false
  sendQueue.set(id, text)
  return true
}

function rejectAllPending(reason: string): void {
  for (const [, entry] of pending) {
    clearTimeout(entry.timer)
    entry.reject(new Error(reason))
  }
  pending.clear()
  sendQueue.clear()
}

function rejectAllSubscriptions(reason: string): void {
  const error = new Error(reason)
  for (const [, entry] of subscriptions) entry.onError?.(error)
  subscriptions.clear()
}

function closeIfUnused(): void {
  if (pending.size === 0 && subscriptions.size === 0 && !feed) closeHaWs()
}

function startHeartbeat(): void {
  stopHeartbeat()
  pingTimer = setInterval(() => {
    if (!socket || state !== 'connected') return
    socket.send(JSON.stringify({ id: nextId(), type: 'ping' }))
    if (pongTimer) clearTimeout(pongTimer)
    pongTimer = setTimeout(() => {
      // No pong: the socket is dead even if TCP hasn't noticed. Force-close to
      // trigger the reconnect path.
      try { socket?.close() } catch { /* already gone */ }
    }, PONG_TIMEOUT_MS)
  }, PING_INTERVAL_MS)
}

function stopHeartbeat(): void {
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = null
  if (pongTimer) clearTimeout(pongTimer)
  pongTimer = null
}

function stopHandshakeTimeout(): void {
  if (handshakeTimer) clearTimeout(handshakeTimer)
  handshakeTimer = null
}

function scheduleRetry(): void {
  if (manuallyClosed || retryTimer || !feed) return
  const delay = Math.min(1000 * 2 ** retryAttempt, MAX_RETRY_DELAY_MS)
  retryAttempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void connect()
  }, delay)
}

function subscribeEntitiesNow(): void {
  if (!feed) return
  feedSubId = nextId()
  feedPrimed = false
  entityMap = new Map()
  rawSend({ id: feedSubId, type: 'subscribe_entities' })
}

function handleMessage(raw: unknown): void {
  let msg: Record<string, unknown>
  try {
    msg = JSON.parse(String(raw)) as Record<string, unknown>
  } catch {
    return
  }

  switch (msg.type) {
    case 'auth_required': {
      void (async () => {
        const { haToken } = await getHAConfig()
        socket?.send(JSON.stringify({ type: 'auth', access_token: haToken }))
      })()
      return
    }
    case 'auth_ok': {
      stopHandshakeTimeout()
      state = 'connected'
      retryAttempt = 0
      startHeartbeat()
      const queued = [...sendQueue.values()]
      sendQueue.clear()
      for (const text of queued) socket?.send(text)
      subscribeEntitiesNow()
      return
    }
    case 'auth_invalid': {
      // Wrong/expired token: keep the slow retry loop alive (the token can be
      // fixed from the admin UI), but report the feed as down meanwhile.
      retryAttempt = 5
      try { socket?.close() } catch { /* noop */ }
      return
    }
    case 'pong': {
      if (pongTimer) clearTimeout(pongTimer)
      pongTimer = null
      return
    }
    case 'result': {
      const id = Number(msg.id)
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      sendQueue.delete(id)
      clearTimeout(entry.timer)
      if (msg.success) entry.resolve(msg.result)
      else {
        const error = msg.error as { message?: string } | undefined
        entry.reject(new Error(error?.message ?? 'Home Assistant command failed'))
      }
      closeIfUnused()
      return
    }
    case 'event': {
      const id = Number(msg.id)
      if (id === feedSubId && feed) {
        const event = msg.event as CompressedStatesEvent
        const { changed, removed } = applyCompressedEvent(entityMap, event)
        if (!feedPrimed) {
          feedPrimed = true
          feed.onSnapshot([...entityMap.values()])
        } else if (changed.length || removed.length) {
          feed.onDelta(changed, removed)
        }
        return
      }
      subscriptions.get(id)?.onEvent(msg.event)
      return
    }
  }
}

async function connect(): Promise<void> {
  if (state !== 'idle') return connectPromise ?? Promise.resolve()
  if (connectPromise) return connectPromise

  // Claim the connecting state synchronously, before reading async config. A
  // cold-start registry Promise.all can no longer create three orphan sockets.
  state = 'connecting'
  manuallyClosed = false
  const generation = ++connectionGeneration

  const attempt: Promise<void> = (async () => {
    const Ctor = nativeWebSocket()
    if (!Ctor) {
      if (generation === connectionGeneration) state = 'idle'
      feed?.onDown('WebSocket non disponibile in questo runtime Node (<22)')
      return
    }
    const { haToken } = await getHAConfig()
    if (generation !== connectionGeneration || manuallyClosed) return
    if (!haToken) {
      state = 'idle'
      feed?.onDown('Home Assistant token missing')
      scheduleRetry()
      return
    }

    let ws: WsLike
    try {
      const websocketUrl = await getHAWebSocketUrl()
      if (generation !== connectionGeneration || manuallyClosed) return
      ws = new Ctor(websocketUrl)
    } catch (error) {
      if (generation === connectionGeneration) state = 'idle'
      feed?.onDown(error instanceof Error ? error.message : 'Home Assistant WS unreachable')
      scheduleRetry()
      return
    }
    if (generation !== connectionGeneration || manuallyClosed) {
      try { ws.close() } catch { /* stale attempt */ }
      return
    }

    socket = ws

    ws.addEventListener('message', (event) => {
      if (socket !== ws) return
      handleMessage(event.data)
    })
    const onGone = (reason: string) => {
      if (socket !== ws) return
      socket = null
      state = 'idle'
      stopHandshakeTimeout()
      stopHeartbeat()
      rejectAllPending(reason)
      rejectAllSubscriptions(reason)
      feedSubId = null
      feedPrimed = false
      if (!manuallyClosed) {
        feed?.onDown(reason)
        scheduleRetry()
      }
    }
    ws.addEventListener('close', (event) => onGone(event.reason || 'Home Assistant WS closed'))
    ws.addEventListener('error', () => onGone('Home Assistant WS error'))
    handshakeTimer = setTimeout(() => {
      if (socket !== ws || state === 'connected') return
      try { ws.close(1008, 'Home Assistant auth timeout') } catch { /* cleanup below */ }
      onGone('Home Assistant authentication timed out')
    }, AUTH_HANDSHAKE_TIMEOUT_MS)
  })().finally(() => {
    if (connectPromise === attempt) connectPromise = null
  })
  connectPromise = attempt
  return attempt
}

/**
 * Sends an id-correlated command (e.g. `config/area_registry/list`,
 * `camera/stream`) and resolves with its result. Opens the socket on demand.
 */
export async function haWsCommand<T>(message: Record<string, unknown>, timeoutMs = COMMAND_TIMEOUT_MS): Promise<T> {
  await connect()
  if (state === 'idle') throw new Error('Home Assistant WebSocket unavailable')
  const id = nextId()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      sendQueue.delete(id)
      reject(new Error('Home Assistant command timed out'))
      closeIfUnused()
    }, timeoutMs)
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
    if (!rawSend({ ...message, id })) {
      pending.delete(id)
      clearTimeout(timer)
      reject(new Error('Home Assistant pre-auth queue is full'))
      closeIfUnused()
    }
  })
}

/**
 * Starts an id-correlated Home Assistant subscription. Used by WebRTC camera
 * signaling, whose answer and ICE candidates arrive as a sequence of events
 * rather than as one command result.
 */
export async function haWsSubscribe<T = unknown>(
  message: Record<string, unknown>,
  handlers: { onEvent: (event: T) => void; onError?: (error: Error) => void },
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<() => void> {
  await connect()
  if (state === 'idle') throw new Error('Home Assistant WebSocket unavailable')
  const id = nextId()
  let stopped = false

  const stop = () => {
    if (stopped) return
    stopped = true
    subscriptions.delete(id)
    sendQueue.delete(id)
    if (state === 'connected') {
      void haWsCommand({ type: 'unsubscribe_events', subscription: id }, 5_000).catch(() => {})
    } else {
      closeIfUnused()
    }
  }

  return new Promise<() => void>((resolve, reject) => {
    const fail = (error: Error) => {
      subscriptions.delete(id)
      handlers.onError?.(error)
      reject(error)
      closeIfUnused()
    }
    const timer = setTimeout(() => {
      pending.delete(id)
      sendQueue.delete(id)
      fail(new Error('Home Assistant subscription timed out'))
    }, timeoutMs)
    subscriptions.set(id, {
      onEvent: handlers.onEvent as (event: unknown) => void,
      onError: handlers.onError,
    })
    pending.set(id, {
      resolve: () => resolve(stop),
      reject: fail,
      timer,
    })
    if (!rawSend({ ...message, id })) {
      pending.delete(id)
      clearTimeout(timer)
      fail(new Error('Home Assistant pre-auth queue is full'))
    }
  })
}

/** Starts (or replaces) the live entity feed. The socket reconnects on its own. */
export function startEntityFeed(handlers: EntityFeedHandlers): void {
  feed = handlers
  manuallyClosed = false
  if (state === 'connected') subscribeEntitiesNow()
  else void connect()
}

/** Stops the feed and closes the socket when nothing else is in flight. */
export function stopEntityFeed(): void {
  feed = null
  feedSubId = null
  feedPrimed = false
  entityMap = new Map()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
  if (pending.size === 0) closeHaWs()
}

export function closeHaWs(): void {
  manuallyClosed = true
  connectionGeneration += 1
  connectPromise = null
  stopHandshakeTimeout()
  stopHeartbeat()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  rejectAllPending('Home Assistant WS closed')
  rejectAllSubscriptions('Home Assistant WS closed')
  try { socket?.close() } catch { /* noop */ }
  socket = null
  state = 'idle'
}
