import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { entityName } from '../components/widgets/utils/mapEntityToWidgetCard'

export interface HANotification {
  id: string
  type: 'system' | 'offline' | 'battery' | 'safety'
  title: string
  message?: string
  entityId: string
  severity: 'critical' | 'warning' | 'info'
}

export function useNotifications(): HANotification[] {
  const entities = useEntityStore((s) => s.entities)

  return useMemo(() => {
    const notifications: HANotification[] = []

    for (const [entityId, entity] of Object.entries(entities)) {
      // ── HA persistent notifications ──────────────────────────────
      if (entityId.startsWith('persistent_notification.') && entity.state !== 'dismissed') {
        notifications.push({
          id: entityId,
          type: 'system',
          title: (entity.attributes?.title as string | undefined) ?? 'Notifica',
          message: (entity.attributes?.message as string | undefined),
          entityId,
          severity: 'info',
        })
        continue
      }

      const deviceClass = String(entity.attributes?.device_class ?? '')
      if (
        entityId.startsWith('binary_sensor.')
        && entity.state === 'on'
        && ['smoke', 'gas', 'carbon_monoxide', 'moisture', 'heat', 'safety', 'problem'].includes(deviceClass)
      ) {
        const friendlyName = entityName(entity)
        notifications.push({
          id: `safety-${entityId}`,
          type: 'safety',
          title: friendlyName,
          message: deviceClass === 'moisture' ? 'Possibile perdita d’acqua' : 'Sensore di sicurezza attivo',
          entityId,
          severity: 'critical',
        })
      }

      // ── Unavailable entities (skip helpers and hidden) ───────────
      if (
        entity.state === 'unavailable' &&
        !entityId.startsWith('persistent_notification.') &&
        !entityId.startsWith('input_') &&
        !entityId.startsWith('group.') &&
        !entityId.startsWith('zone.')
      ) {
        const friendlyName = entityName(entity)
        notifications.push({
          id: `offline-${entityId}`,
          type: 'offline',
          title: `${friendlyName} offline`,
          message: 'Dispositivo non raggiungibile',
          entityId,
          severity: 'warning',
        })
        continue
      }

      // ── Low battery ───────────────────────────────────────────────
      const batteryLevel =
        (entity.attributes?.battery_level as number | undefined) ??
        (entity.attributes?.battery as number | undefined)
      if (batteryLevel !== undefined && batteryLevel < 20) {
        const friendlyName = entityName(entity)
        notifications.push({
          id: `battery-${entityId}`,
          type: 'battery',
          title: `${friendlyName} — batteria bassa`,
          message: `${batteryLevel}% rimanente`,
          entityId,
          severity: batteryLevel < 10 ? 'critical' : 'warning',
        })
      }
    }

    // Sort: critical first, then warnings, then info
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
    return notifications.sort((a, b) => order[a.severity] - order[b.severity])
  }, [entities])
}
