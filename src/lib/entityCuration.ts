import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import type { HAEntityReg } from '../api/ha-registry'

const DASHBOARD_EXCLUDED_CATEGORIES = new Set(['config', 'diagnostic'])
const RELEVANT_OFFLINE_DOMAINS = new Set([
  'alarm_control_panel', 'camera', 'climate', 'cover', 'fan', 'humidifier',
  'lawn_mower', 'light', 'lock', 'media_player', 'siren', 'switch', 'vacuum',
  'valve', 'water_heater',
])
const RELEVANT_BINARY_CLASSES = new Set([
  'carbon_monoxide', 'door', 'gas', 'garage_door', 'heat', 'moisture',
  'opening', 'problem', 'safety', 'smoke', 'window',
])
const CAMERA_SETTING_PLATFORMS = new Set(['ezviz', 'ring'])

function isCameraSetting(entry: HAEntityReg): boolean {
  return entry.entity_id.startsWith('switch.')
    && CAMERA_SETTING_PLATFORMS.has(String(entry.platform ?? '').toLowerCase())
}

/** Registry is the only authoritative source for HA visibility and category. */
export function dashboardExcludedEntityIds(entries: HAEntityReg[]): Set<string> {
  return new Set(entries
    .filter((entry) => Boolean(entry.hidden_by)
      || Boolean(entry.disabled_by)
      || DASHBOARD_EXCLUDED_CATEGORIES.has(String(entry.entity_category ?? '').toLowerCase())
      || isCameraSetting(entry))
    .map((entry) => entry.entity_id))
}

function normalizedFriendlyName(entity: HassEntity): string {
  return String(entity.attributes?.friendly_name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('it')
}

/** Duplicate source relays must not appear beside the semantic light card. */
export function duplicateSwitchProxyEntityIds(entities: HassEntities): Set<string> {
  const lightNames = new Set(Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('light.'))
    .map(normalizedFriendlyName)
    .filter(Boolean))
  return new Set(Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('switch.')
      && lightNames.has(normalizedFriendlyName(entity)))
    .map((entity) => entity.entity_id))
}

/**
 * Availability becomes a user alert only for a controllable appliance or a
 * safety/access sensor. Background telemetry and trackers remain diagnostics.
 */
export function isRelevantUnavailableEntity(
  entity: { entity_id: string; state: string; attributes?: Record<string, unknown> },
): boolean {
  if (entity.state !== 'unavailable') return false
  const domain = entity.entity_id.split('.')[0]
  if (RELEVANT_OFFLINE_DOMAINS.has(domain)) return true
  return domain === 'binary_sensor'
    && RELEVANT_BINARY_CLASSES.has(String(entity.attributes?.device_class ?? '').toLowerCase())
}
