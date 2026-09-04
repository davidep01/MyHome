import type { CriticalAlert } from './criticalAlerts'
import type { OfflineReport } from './offlineDevices'
import type { HANotification } from '../hooks/useNotifications'

export type AttentionCategory = 'safety' | 'security' | 'availability' | 'battery' | 'configuration'
export type AttentionSeverity = 'critical' | 'warning' | 'info'

export interface AttentionItem {
  id: string
  category: AttentionCategory
  severity: AttentionSeverity
  text: string
  /** Cambia quando la condizione sottostante cambia: usato per "ignora finché non cambia". */
  fingerprint: string
  /** false = sempre visibile, non posticipabile (sicurezza/intrusione). */
  suppressible: boolean
  actionTarget?: 'system'
}

export interface SystemProblem {
  id: string
  severity: 'danger' | 'warn'
  text: string
  actionTarget?: 'system'
}

export interface AttentionInput {
  criticalAlerts: CriticalAlert[]
  offline: OfflineReport
  /** Già filtrate a type === 'battery' da chi chiama. */
  batteryNotifications: HANotification[]
  systemProblems: SystemProblem[]
}

const SECURITY_KINDS = new Set<CriticalAlert['kind']>(['intrusion', 'siren'])

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 }
const CATEGORY_RANK: Record<AttentionCategory, number> = { safety: 0, security: 1, availability: 2, battery: 3, configuration: 4 }

function offlineSummaryText(offline: OfflineReport): string {
  const integrationCount = offline.integrations.length
  const deviceWord = offline.deviceCount === 1 ? 'dispositivo offline' : 'dispositivi offline'
  if (integrationCount <= 1) return `${offline.deviceCount} ${deviceWord}`
  return `${offline.deviceCount} ${deviceWord} in ${integrationCount} integrazioni`
}

/**
 * Compone la lista unificata "cosa non va" da quattro fonti già esistenti e
 * testate — non ridefinisce nessuna regola di rilevamento, solo tassonomia e
 * ordinamento condivisi. `suppressible` è per categoria, non per severità: un
 * allarme fumo/intrusione resta sempre visibile anche se "critico" non è mai
 * l'unico grado, mentre una batteria critica può comunque essere posticipata
 * da chi la conosce già.
 */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []

  for (const alert of input.criticalAlerts) {
    items.push({
      id: `critical-${alert.id}`,
      category: SECURITY_KINDS.has(alert.kind) ? 'security' : 'safety',
      severity: 'critical',
      text: alert.title,
      fingerprint: `${alert.kind}:${alert.changedAt}`,
      suppressible: false,
    })
  }

  if (input.offline.deviceCount > 0) {
    const entityIds = input.offline.integrations
      .flatMap((integration) => integration.entries.map((entry) => entry.entityId))
      .sort()
    items.push({
      id: 'availability-offline',
      category: 'availability',
      severity: 'warning',
      text: offlineSummaryText(input.offline),
      fingerprint: entityIds.join(','),
      suppressible: true,
    })
  }

  for (const notification of input.batteryNotifications) {
    items.push({
      id: `battery-${notification.entityId}`,
      category: 'battery',
      severity: notification.severity === 'critical' ? 'critical' : 'warning',
      text: `${notification.title}${notification.message ? ` — ${notification.message}` : ''}`,
      fingerprint: notification.severity,
      suppressible: true,
    })
  }

  for (const problem of input.systemProblems) {
    items.push({
      id: `configuration-${problem.id}`,
      category: 'configuration',
      severity: problem.severity === 'danger' ? 'critical' : 'warning',
      text: problem.text,
      fingerprint: `${problem.severity}:${problem.text}`,
      suppressible: true,
      actionTarget: problem.actionTarget,
    })
  }

  return items.sort((a, b) => (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
    || a.id.localeCompare(b.id)
  ))
}
