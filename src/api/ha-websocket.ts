import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService as haCallService,
  type HassEntities,
  type Connection,
} from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { configApi } from './backend'

let connection: Connection | null = null

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
    haUrl: import.meta.env.VITE_HA_URL ?? 'http://homeassistant.local:8123',
    haToken: import.meta.env.VITE_HA_TOKEN ?? '',
  }
}

export async function connectHA(): Promise<Connection> {
  if (connection) return connection

  const { haUrl, haToken } = await getHACredentials()
  if (!haToken || haToken.startsWith('your_')) {
    useEntityStore.getState().setConnected(false)
    throw new Error('Home Assistant token is missing')
  }

  const auth = createLongLivedTokenAuth(haUrl, haToken)
  try {
    connection = await createConnection({ auth })
  } catch (error) {
    useEntityStore.getState().setConnected(false)
    throw error
  }

  subscribeEntities(connection, (entities: HassEntities) => {
    useEntityStore.getState().setEntities(entities)
    useEntityStore.getState().setConnected(true)
  })

  connection.addEventListener('disconnected', () => {
    useEntityStore.getState().setConnected(false)
  })
  connection.addEventListener('ready', () => {
    useEntityStore.getState().setConnected(true)
  })
  useEntityStore.getState().setConnected(true)

  return connection
}

export async function callService(
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>,
): Promise<void> {
  if (!connection) throw new Error('Not connected to Home Assistant')
  await haCallService(connection, domain, service, serviceData)
}

export function getConnection(): Connection | null {
  return connection
}
