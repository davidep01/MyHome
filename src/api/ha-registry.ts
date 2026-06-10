import { haApi } from './backend'

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
  /** 'diagnostic' | 'config' | null — vive nel registry, NON negli attributi di stato. */
  entity_category?: string | null
  /** Nome assegnato in HA (override del friendly_name dell'integrazione). */
  name?: string | null
}

interface RegistryPayload {
  areas: HAArea[]
  devices: HADevice[]
  entities: HAEntityReg[]
}

// One in-flight request shared by all callers; the backend caches for 60s, so
// areas()+entities() on the same screen cost a single round trip.
let inFlight: Promise<RegistryPayload> | null = null
function fetchRegistry(): Promise<RegistryPayload> {
  if (!inFlight) {
    inFlight = (haApi.registry() as Promise<RegistryPayload>)
      .finally(() => { inFlight = null })
  }
  return inFlight
}

/**
 * Home Assistant registries, proxied by the backend (`/api/ha/registry`): no
 * client holds an authenticated HA socket. Works on kiosk and desktop alike.
 */
export const haRegistry = {
  areas: () => fetchRegistry().then((r) => r.areas),
  devices: () => fetchRegistry().then((r) => r.devices),
  entities: () => fetchRegistry().then((r) => r.entities),
}
