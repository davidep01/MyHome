import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService as haCallService,
  type HassEntities,
  type Connection,
} from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'

let connection: Connection | null = null

export async function connectHA(): Promise<Connection> {
  if (connection) return connection

  const url = import.meta.env.VITE_HA_URL ?? 'http://homeassistant.local:8123'
  const token = import.meta.env.VITE_HA_TOKEN ?? ''

  const auth = createLongLivedTokenAuth(url, token)
  connection = await createConnection({ auth })

  subscribeEntities(connection, (entities: HassEntities) => {
    useEntityStore.getState().setEntities(entities)
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
