import type { AppConfig, DoorbellDevice } from '../api/backend'

/** States considered "ringing" for binary_sensor-style doorbells. */
export const DOORBELL_ACTIVE_STATES = ['on', 'ringing', 'detected', 'pressed']

/**
 * Normalizes the doorbell config into a list of active devices, migrating the
 * legacy single `doorbell` setting into the multi-device array when needed.
 */
export function normalizeDoorbells(config?: AppConfig): DoorbellDevice[] {
  if (config?.doorbells?.length) {
    return config.doorbells.filter((d) => d.active !== false && d.entityId)
  }
  const legacy = config?.doorbell
  if (legacy?.entityId) {
    return [{
      id: 'legacy',
      name: 'Campanello',
      entityId: legacy.entityId,
      cameraEntityId: legacy.cameraEntityId,
      sound: 'dingdong',
      priority: 'high',
      active: true,
    }]
  }
  return []
}
