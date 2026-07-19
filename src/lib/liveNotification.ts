import type { HANotification } from '../hooks/useNotifications'

/** Seleziona un solo evento nuovo; gli offline già annunciati non riaprono il toast. */
export function selectNewLiveNotification(
  notifications: HANotification[],
  seenIds: ReadonlySet<string>,
  announcedOfflineIds: ReadonlySet<string>,
): HANotification | undefined {
  return notifications.find((notification) => (
    !seenIds.has(notification.id)
    && (notification.type !== 'offline' || !announcedOfflineIds.has(notification.id))
  ))
}
