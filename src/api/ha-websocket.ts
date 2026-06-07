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
let reconnectAttempt = 0
let manuallyClosed = false
let proxyMode = false

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
