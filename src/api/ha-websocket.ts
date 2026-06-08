import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService as haCallService,
  type HassEntities,
  type HassEntity,
  type Connection,
  type UnsubscribeFunc,
} from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { configApi, haApi } from './backend'

let connection: Connection | null = null
let connectionPromise: Promise<Connection> | null = null
let unsubscribeEntities: UnsubscribeFunc | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let proxyPollTimer: ReturnType<typeof setInterval> | null = null
let eventSource: EventSource | null = null
let reconnectAttempt = 0
let manuallyClosed = false
let proxyMode = false

type HaStreamEvent =
  | { type: 'snapshot'; entities: HassEntity[] }
  | { type: 'delta'; changed: HassEntity[]; removed: string[] }
  | { type: 'error'; message: string }

const MAX_RECONNECT_DELAY = 30_000
const PROXY_POLL_MS = 4000

async function getHACredentials() {
  try {
    const credentials = await configApi.getCredentials()
    if (credentials.haUrl && credentials.haToken && credentials.haToken !== '***') {
      return credentials
    }
  } catch (error) {
    console.warn('Could not load HA credentials from backend, falling back to Vite env', error)
  }

  return {
    haUrl: 'http://homeassistant.local:8123',
    haToken: '',
  }
}

export async function connectHA(): Promise<Connection> {
  proxyMode = false
  disconnectHAProxy()
  if (connection) return connection
  if (connectionPromise) return connectionPromise

  manuallyClosed = false
  useEntityStore.getState().setConnectionStatus('connecting')

  connectionPromise = connectOnce()
  try {
    connection = await connectionPromise
    return connection
  } finally {
    connectionPromise = null
  }
}

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
  proxyMode = true
  manuallyClosed = false
  if (connection) disconnectHA()
  if (proxyPollTimer) return
  useEntityStore.getState().setConnectionStatus('connecting')
  await pollProxyStates()
  proxyPollTimer = setInterval(() => {
    pollProxyStates().catch(() => {})
  }, PROXY_POLL_MS)
}

async function connectOnce(): Promise<Connection> {
  const { haUrl, haToken } = await getHACredentials()
  if (!haToken || haToken.startsWith('your_')) {
    useEntityStore.getState().setConnectionStatus('error', 'Home Assistant token is missing')
    throw new Error('Home Assistant token is missing')
  }

  const auth = createLongLivedTokenAuth(haUrl, haToken)
  let nextConnection: Connection
  try {
    nextConnection = await createConnection({ auth })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Home Assistant connection failed'
    useEntityStore.getState().setConnectionStatus('error', message)
    scheduleReconnect()
    throw error
  }

  unsubscribeEntities?.()
  unsubscribeEntities = subscribeEntities(nextConnection, (entities: HassEntities) => {
    useEntityStore.getState().setEntities(entities)
    useEntityStore.getState().setConnectionStatus('connected')
    reconnectAttempt = 0
  })

  nextConnection.addEventListener('disconnected', () => {
    connection = null
    unsubscribeEntities?.()
    unsubscribeEntities = null
    useEntityStore.getState().setConnectionStatus('disconnected')
    scheduleReconnect()
  })
  nextConnection.addEventListener('ready', () => {
    useEntityStore.getState().setConnectionStatus('connected')
    reconnectAttempt = 0
  })
  useEntityStore.getState().setConnectionStatus('connected')

  return nextConnection
}

function scheduleReconnect() {
  if (manuallyClosed || reconnectTimer) return
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectHA().catch((error) => {
      const message = error instanceof Error ? error.message : 'Home Assistant reconnect failed'
      useEntityStore.getState().setConnectionStatus('error', message)
    })
  }, delay)
}

export async function callService(
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
): Promise<void> {
  if (proxyMode) {
    await haApi.service(domain, service, serviceData)
    return
  }
  try {
    const conn = connection ?? await connectHA()
    await haCallService(conn, domain, service, serviceData)
  } catch (error) {
    await haApi.service(domain, service, serviceData)
    if (error instanceof Error) {
      console.warn('HA WebSocket service failed; used REST fallback', error.message)
    }
  }
}

export function getConnection(): Connection | null {
  return connection
}

export function disconnectHA() {
  manuallyClosed = true
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  unsubscribeEntities?.()
  unsubscribeEntities = null
  connection?.close()
  connection = null
  connectionPromise = null
  useEntityStore.getState().setConnectionStatus('disconnected')
}

export function disconnectHAProxy() {
  if (proxyPollTimer) clearInterval(proxyPollTimer)
  proxyPollTimer = null
  if (proxyMode) useEntityStore.getState().setConnectionStatus('disconnected')
}

function applyStreamEvent(event: HaStreamEvent): void {
  const store = useEntityStore.getState()
  if (event.type === 'snapshot') {
    const next: HassEntities = {}
    for (const entity of event.entities) next[entity.entity_id] = entity
    store.setEntities(next)
    store.setConnectionStatus('connected')
  } else if (event.type === 'delta') {
    // Merge changed entities; keep everything else (incl. recent optimistic state)
    // so the UI never flickers back on an unrelated update.
    const next: HassEntities = { ...store.entities }
    for (const entity of event.changed) next[entity.entity_id] = entity
    for (const id of event.removed) delete next[id]
    store.setEntities(next)
    store.setConnectionStatus('connected')
  } else if (event.type === 'error') {
    store.setConnectionStatus('error', event.message)
  }
}

/**
 * Kiosk-safe live connection: subscribes to the backend SSE entity stream
 * (HA token stays server-side, real-time deltas). Falls back automatically to
 * REST polling if EventSource is unsupported, disabled, or the stream never
 * delivers data (e.g. a buffering WebView). Set localStorage `myhome.haStream`
 * to `off` to force the poll path.
 */
export async function connectHAStream(): Promise<void> {
  manuallyClosed = false
  const disabled = typeof localStorage !== 'undefined' && localStorage.getItem('myhome.haStream') === 'off'
  if (typeof EventSource === 'undefined' || disabled) {
    await connectHAProxy()
    return
  }
  disconnectHA()
  if (eventSource) return
  proxyMode = true // service calls + fallback route through the backend
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
  if (eventSource) { eventSource.close(); eventSource = null }
  disconnectHAProxy()
}
