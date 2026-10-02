import { randomUUID } from 'node:crypto'
import { haWsCommand, haWsSubscribe } from './ha-ws.js'

export type WebRtcSignalEvent =
  | { type: 'session'; session_id: string }
  | { type: 'answer'; answer: string }
  | { type: 'candidate'; candidate: Record<string, unknown> }
  | { type: 'error'; code: string; message: string }

type Candidate = Record<string, unknown>

interface WebRtcSession {
  id: string
  entityId: string
  haSessionId?: string
  pendingCandidates: Candidate[]
  queuedEvents: WebRtcSignalEvent[]
  listeners: Set<(event: WebRtcSignalEvent) => void>
  unsubscribe?: () => void
  expires?: ReturnType<typeof setTimeout>
}

const SESSION_TTL_MS = 2 * 60_000
const MAX_SESSIONS = 12
const MAX_QUEUED_EVENTS = 64
const MAX_PENDING_CANDIDATES = 32
const sessions = new Map<string, WebRtcSession>()

function signalEvent(value: unknown): WebRtcSignalEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const event = value as Record<string, unknown>
  if (event.type === 'session' && typeof event.session_id === 'string' && event.session_id.length <= 256) {
    return { type: 'session', session_id: event.session_id }
  }
  if (event.type === 'answer' && typeof event.answer === 'string' && event.answer.length <= 512_000) {
    return { type: 'answer', answer: event.answer }
  }
  if (event.type === 'candidate' && event.candidate && typeof event.candidate === 'object' && !Array.isArray(event.candidate)) {
    return { type: 'candidate', candidate: event.candidate as Candidate }
  }
  if (event.type === 'error' && typeof event.message === 'string') {
    return {
      type: 'error',
      code: typeof event.code === 'string' ? event.code.slice(0, 128) : 'webrtc_error',
      message: event.message.slice(0, 1_024),
    }
  }
  return null
}

function emit(session: WebRtcSession, event: WebRtcSignalEvent): void {
  if (session.listeners.size === 0) {
    session.queuedEvents.push(event)
    if (session.queuedEvents.length > MAX_QUEUED_EVENTS) session.queuedEvents.shift()
    return
  }
  for (const listener of session.listeners) listener(event)
}

async function flushCandidates(session: WebRtcSession): Promise<void> {
  if (!session.haSessionId || session.pendingCandidates.length === 0) return
  const candidates = session.pendingCandidates.splice(0)
  for (const candidate of candidates) {
    if (!sessions.has(session.id)) return
    await haWsCommand({
      type: 'camera/webrtc/candidate',
      entity_id: session.entityId,
      session_id: session.haSessionId,
      candidate,
    })
  }
}

function removeOldestSession(): void {
  const oldest = [...sessions.values()].find((session) => session.listeners.size === 0)
  if (!oldest) throw new Error('Tutte le sessioni video sono in uso. Riprova dopo aver chiuso una camera.')
  closeWebRtcSession(oldest.id)
}

export async function startWebRtcSession(entityId: string, offer: string): Promise<string> {
  while (sessions.size >= MAX_SESSIONS) removeOldestSession()
  const id = randomUUID()
  const session: WebRtcSession = {
    id,
    entityId,
    pendingCandidates: [],
    queuedEvents: [],
    listeners: new Set(),
    expires: setTimeout(() => closeWebRtcSession(id), SESSION_TTL_MS),
  }
  sessions.set(id, session)

  try {
    const unsubscribe = await haWsSubscribe<WebRtcSignalEvent>({
      type: 'camera/webrtc/offer',
      entity_id: entityId,
      offer,
    }, {
      onEvent: (rawEvent) => {
        const current = sessions.get(id)
        if (!current) return
        const event = signalEvent(rawEvent)
        if (!event) return
        if (event.type === 'session') {
          current.haSessionId = event.session_id
          void flushCandidates(current).catch((error: unknown) => {
            if (sessions.has(id)) emit(current, { type: 'error', code: 'ice_candidate', message: error instanceof Error ? error.message.slice(0, 1024) : 'Invio ICE fallito' })
          })
        }
        emit(current, event)
      },
      onError: (error) => {
        const current = sessions.get(id)
        if (!current) return
        emit(current, { type: 'error', code: 'ha_connection', message: error.message.slice(0, 1_024) })
      },
    }, 20_000)
    if (!sessions.has(id)) { unsubscribe(); throw new Error('Sessione video scaduta durante la connessione') }
    session.unsubscribe = unsubscribe
  } catch (error) {
    closeWebRtcSession(id)
    throw error
  }
  return id
}

export function hasWebRtcSession(id: string): boolean {
  return sessions.has(id)
}

export function listenWebRtcSession(id: string, listener: (event: WebRtcSignalEvent) => void): (() => void) | null {
  const session = sessions.get(id)
  if (!session) return null
  clearTimeout(session.expires)
  session.expires = undefined
  session.listeners.add(listener)
  const queued = session.queuedEvents.splice(0)
  for (const event of queued) listener(event)
  return () => {
    session.listeners.delete(listener)
    if (session.listeners.size === 0 && sessions.has(id)) {
      clearTimeout(session.expires)
      session.expires = setTimeout(() => closeWebRtcSession(id), SESSION_TTL_MS)
    }
  }
}

export async function addWebRtcCandidate(id: string, candidate: Candidate): Promise<boolean> {
  const session = sessions.get(id)
  if (!session) return false
  if (!session.haSessionId) {
    if (session.pendingCandidates.length >= MAX_PENDING_CANDIDATES) throw new Error('Troppi candidati ICE in attesa')
    session.pendingCandidates.push(candidate)
    return true
  }
  await haWsCommand({
    type: 'camera/webrtc/candidate',
    entity_id: session.entityId,
    session_id: session.haSessionId,
    candidate,
  })
  return true
}

export function closeWebRtcSession(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  sessions.delete(id)
  clearTimeout(session.expires)
  session.unsubscribe?.()
  // Wake a signaling stream waiting for its next event, without a 15s ping
  // delay after explicit close or eviction. SSE observes the deleted session.
  for (const listener of session.listeners) listener({ type: 'error', code: 'session_closed', message: 'Sessione video chiusa' })
  session.listeners.clear()
  session.pendingCandidates.length = 0
  session.queuedEvents.length = 0
  return true
}

export const haWebRtcInternals = { signalEvent }
