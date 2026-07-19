import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import type { DeviceOverride } from '../api/backend'

const PRESENCE_CLASSES = new Set(['motion', 'occupancy', 'presence', 'moving'])
const ACTIVE_STATES = new Set(['on', 'playing', 'cleaning', 'mowing', 'heating', 'cooling', 'open', 'unlocked'])
const ROOM_DOMAIN_PRIORITY = new Map([
  ['alarm_control_panel', 0],
  ['siren', 1],
  ['climate', 2],
  ['media_player', 3],
  ['light', 4],
  ['cover', 5],
  ['lock', 6],
  ['fan', 7],
  ['switch', 8],
  ['input_boolean', 9],
  ['vacuum', 10],
  ['lawn_mower', 11],
  ['scene', 12],
  ['sensor', 13],
  ['binary_sensor', 14],
])

function domainOf(entityId: string): string {
  return entityId.split('.')[0]
}

export function isPresenceEntity(entity: Pick<HassEntity, 'entity_id' | 'attributes'>): boolean {
  const domain = domainOf(entity.entity_id)
  return domain === 'person'
    || domain === 'device_tracker'
    || (domain === 'binary_sensor' && PRESENCE_CLASSES.has(String(entity.attributes?.device_class ?? '').toLowerCase()))
}

/** Media delle sole temperature ambiente realmente riportate dai climate. */
export function meanIndoorClimateTemperature(entities: HassEntities): number | null {
  const values = Object.values(entities).flatMap((entity) => {
    if (!entity.entity_id.startsWith('climate.') || entity.state === 'unavailable' || entity.state === 'unknown') return []
    const value = Number(entity.attributes?.current_temperature)
    return Number.isFinite(value) ? [value] : []
  })
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Temperatura meteo da HA quando OpenWeather non è configurato. */
export function externalTemperatureFromEntities(entities: HassEntities): number | null {
  const weather = Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('weather.')
      && entity.state !== 'unavailable'
      && entity.state !== 'unknown')
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    .map((entity) => Number(entity.attributes?.temperature))
    .find(Number.isFinite)
  if (weather !== undefined) return weather

  const OUTDOOR_WORDS = ['outdoor', 'outside', 'external', 'esterna', 'esterno', 'meteo']
  const sensor = Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('sensor.')
      && entity.state !== 'unavailable'
      && entity.state !== 'unknown'
      && String(entity.attributes?.device_class ?? '').toLowerCase() === 'temperature'
      && OUTDOOR_WORDS.some((word) => `${entity.entity_id} ${String(entity.attributes?.friendly_name ?? '')}`.toLowerCase().includes(word)))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    .map((entity) => Number(entity.state))
    .find(Number.isFinite)
  return sensor ?? null
}

export interface CameraSelectionOptions {
  hiddenEntities?: string[]
  overrides?: Record<string, DeviceOverride>
  preferredEntityIds?: string[]
  allowedEntityIds?: string[]
  limit?: number
}

/**
 * Selezione deterministica della fila video. Le camere configurate come
 * campanello e i live view precedono snapshot/registrazioni, poi l'ordine è
 * stabile per entity_id per evitare riordini a ogni push.
 */
export function selectDashboardCameraIds(
  entities: HassEntities,
  options: CameraSelectionOptions = {},
): string[] {
  const hidden = new Set(options.hiddenEntities ?? [])
  const allowed = options.allowedEntityIds ? new Set(options.allowedEntityIds) : null
  const preferred = new Map((options.preferredEntityIds ?? []).map((id, index) => [id, index]))
  const limit = Math.max(1, options.limit ?? 3)

  return Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('camera.')
      && !hidden.has(entity.entity_id)
      && (!allowed || allowed.has(entity.entity_id))
      && options.overrides?.[entity.entity_id]?.enabled !== false)
    .map((entity) => {
      const text = `${entity.entity_id} ${String(entity.attributes?.friendly_name ?? '')}`.toLowerCase()
      const preferredIndex = preferred.get(entity.entity_id)
      let score = preferredIndex === undefined ? 0 : 20_000 - preferredIndex
      if (options.overrides?.[entity.entity_id]?.hero === 'always') score += 10_000
      if (text.includes('live_view') || text.includes('live view') || text.includes('diretta')) score += 1_000
      if (text.includes('snapshot') || text.includes('last_recording') || text.includes('ultima registrazione')) score -= 1_000
      if (entity.state === 'unavailable' || entity.state === 'unknown') score -= 2_000
      return { id: entity.entity_id, score }
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ id }) => id)
}

/** Card principali della stanza, senza camere (già nella prima fila) né presenza. */
export function selectRoomDashboardIds(
  entityIds: string[],
  entities: HassEntities,
  overrides?: Record<string, DeviceOverride>,
  limit = 6,
): string[] {
  return entityIds
    .map((id) => entities[id])
    .filter((entity): entity is HassEntity => Boolean(entity)
      && !entity.entity_id.startsWith('camera.')
      && !isPresenceEntity(entity)
      && overrides?.[entity.entity_id]?.enabled !== false
      && entity.attributes?.entity_category !== 'diagnostic')
    .map((entity) => {
      const domain = domainOf(entity.entity_id)
      const hvacAction = String(entity.attributes?.hvac_action ?? '')
      const active = ACTIVE_STATES.has(entity.state) || ACTIVE_STATES.has(hvacAction)
      const pinned = overrides?.[entity.entity_id]?.hero === 'always'
      const unavailable = entity.state === 'unavailable' || entity.state === 'unknown'
      const rank = ROOM_DOMAIN_PRIORITY.get(domain) ?? 99
      return {
        id: entity.entity_id,
        score: (pinned ? 20_000 : 0) + (active ? 5_000 : 0) - (unavailable ? 2_000 : 0) - rank * 10,
      }
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, limit))
    .map(({ id }) => id)
}
