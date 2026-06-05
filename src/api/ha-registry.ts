import { getConnection } from './ha-websocket'

export interface HAArea {
  area_id: string
  name: string
  icon?: string | null
}
export interface HADevice {
  id: string
  area_id: string | null
}
export interface HAEntityReg {
  entity_id: string
  area_id: string | null
  device_id: string | null
  hidden_by: string | null
  /** Integration that provides the entity (e.g. 'ring', 'ezviz'). */
  platform: string | null
}

async function ws<T>(type: string): Promise<T> {
  const conn = getConnection()
  if (!conn) throw new Error('Home Assistant non connesso')
  return conn.sendMessagePromise<T>({ type })
}

/** Home Assistant registries (used to auto-build per-area dashboards). */
export const haRegistry = {
  areas: () => ws<HAArea[]>('config/area_registry/list'),
  devices: () => ws<HADevice[]>('config/device_registry/list'),
  entities: () => ws<HAEntityReg[]>('config/entity_registry/list'),
}
