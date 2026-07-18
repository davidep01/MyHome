import type { ActionShortcut, AppConfig, DoorbellDevice } from '../api/backend'

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

/** Actions configured for the doorbell that owns a given camera live view. */
export function cameraDoorbellShortcuts(
  doorbells: DoorbellDevice[] | undefined,
  cameraEntityId: string,
): ActionShortcut[] {
  const seen = new Set<string>()
  const shortcuts: ActionShortcut[] = []
  for (const doorbell of doorbells ?? []) {
    if (doorbell.active === false || doorbell.cameraEntityId !== cameraEntityId) continue
    for (const shortcut of doorbell.shortcuts ?? []) {
      const key = shortcut.id || `${shortcut.entityId}:${shortcut.label}`
      if (seen.has(key)) continue
      seen.add(key)
      shortcuts.push(shortcut)
    }
  }
  return shortcuts
}
