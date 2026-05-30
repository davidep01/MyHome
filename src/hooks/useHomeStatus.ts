import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useEntityStore } from '../store/entities'
import { useNotifications } from './useNotifications'
import { tokens } from '../design/tokens'

const criticalBinaryClasses = new Set([
  'door',
  'garage_door',
  'lock',
  'moisture',
  'motion',
  'opening',
  'smoke',
  'tamper',
  'window',
])

export function useHomeStatus() {
  const entities = useEntityStore((s) => s.entities)
  const notifications = useNotifications()

  return useMemo(() => {
    const binaryAlerts = Object.values(entities).filter((entity) => {
      if (!entity.entity_id.startsWith('binary_sensor.') || entity.state !== 'on') return false
      const deviceClass = entity.attributes?.device_class as string | undefined
      return deviceClass ? criticalBinaryClasses.has(deviceClass) : false
    })

    const triggeredAlarms = Object.values(entities).filter(
      (entity) => entity.entity_id.startsWith('alarm_control_panel.') && entity.state === 'triggered',
    )

    const criticalNotifications = notifications.filter((n) => n.severity === 'critical')
    const warningCount = notifications.filter((n) => n.severity === 'warning').length
    const alertCount = binaryAlerts.length + triggeredAlarms.length + criticalNotifications.length

    if (triggeredAlarms.length > 0 || criticalNotifications.length > 0) {
      return {
        label: `${alertCount} avvisi critici`,
        detail: triggeredAlarms[0]?.attributes?.friendly_name as string | undefined,
        count: alertCount,
        tone: 'critical' as const,
        color: tokens.accent.red,
        Icon: ShieldAlert,
      }
    }

    if (binaryAlerts.length > 0 || warningCount > 0) {
      return {
        label: `${binaryAlerts.length + warningCount} avvisi`,
        detail: (binaryAlerts[0]?.attributes?.friendly_name as string | undefined) ?? notifications[0]?.title,
        count: binaryAlerts.length + warningCount,
        tone: 'warning' as const,
        color: tokens.accent.orange,
        Icon: AlertTriangle,
      }
    }

    return {
      label: 'Tutto è sicuro',
      detail: 'Nessun avviso attivo',
      count: 0,
      tone: 'ok' as const,
      color: tokens.accent.green,
      Icon: CheckCircle2,
    }
  }, [entities, notifications])
}
