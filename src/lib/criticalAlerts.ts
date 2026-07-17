export type CriticalAlertKind = 'intrusion' | 'smoke' | 'gas' | 'water' | 'heat' | 'safety' | 'siren'

export interface CriticalEntity {
  entity_id: string
  state: string
  last_changed?: string
  attributes?: Record<string, unknown>
}

export interface CriticalAlert {
  id: string
  entityId: string
  kind: CriticalAlertKind
  title: string
  detail: string
  instruction: string
  priority: number
  changedAt: string
}

/** Stable for one activation, different when the same sensor triggers again. */
export function criticalAlertEventKey(alert?: Pick<CriticalAlert, 'id' | 'changedAt'> | null): string | null {
  if (!alert) return null
  return `${alert.id}:${alert.changedAt || 'unknown-time'}`
}

const BINARY_META: Record<string, Omit<CriticalAlert, 'id' | 'entityId' | 'changedAt'>> = {
  smoke: {
    kind: 'smoke', title: 'Fumo rilevato', detail: 'Un sensore antincendio è attivo.',
    instruction: 'Verifica subito l’area e chiama i soccorsi se necessario.', priority: 0,
  },
  carbon_monoxide: {
    kind: 'gas', title: 'Monossido di carbonio', detail: 'È stata rilevata una concentrazione pericolosa.',
    instruction: 'Esci dall’area, arieggia se sicuro e contatta i soccorsi.', priority: 0,
  },
  gas: {
    kind: 'gas', title: 'Gas rilevato', detail: 'Un sensore gas è entrato in allarme.',
    instruction: 'Non azionare interruttori; allontanati e verifica l’impianto.', priority: 0,
  },
  moisture: {
    kind: 'water', title: 'Possibile allagamento', detail: 'Un sensore acqua o umidità è attivo.',
    instruction: 'Controlla subito la zona e chiudi l’acqua se necessario.', priority: 1,
  },
  heat: {
    kind: 'heat', title: 'Calore anomalo', detail: 'Un sensore temperatura di sicurezza è attivo.',
    instruction: 'Verifica immediatamente la zona segnalata.', priority: 1,
  },
  safety: {
    kind: 'safety', title: 'Allarme di sicurezza', detail: 'Un sensore di sicurezza è attivo.',
    instruction: 'Controlla immediatamente il dispositivo e l’area.', priority: 1,
  },
  problem: {
    kind: 'safety', title: 'Problema critico', detail: 'Un dispositivo segnala un guasto importante.',
    instruction: 'Apri il controllo per verificare il dettaglio.', priority: 2,
  },
}

function friendlyName(entity: CriticalEntity): string {
  const value = entity.attributes?.friendly_name
  return typeof value === 'string' && value.trim() ? value.trim() : entity.entity_id
}

export function deriveCriticalAlerts(entities: Record<string, CriticalEntity>): CriticalAlert[] {
  const alerts: CriticalAlert[] = []

  for (const entity of Object.values(entities)) {
    const domain = entity.entity_id.split('.')[0]
    const changedAt = entity.last_changed ?? ''
    const name = friendlyName(entity)

    if (domain === 'alarm_control_panel' && entity.state === 'triggered') {
      alerts.push({
        id: `intrusion:${entity.entity_id}`,
        entityId: entity.entity_id,
        kind: 'intrusion',
        title: 'Allarme intrusione',
        detail: `${name} è entrato in allarme.`,
        instruction: 'Verifica le telecamere e gestisci l’allarme dal controllo dedicato.',
        priority: 0,
        changedAt,
      })
      continue
    }

    if (domain === 'siren' && entity.state === 'on') {
      alerts.push({
        id: `siren:${entity.entity_id}`,
        entityId: entity.entity_id,
        kind: 'siren',
        title: 'Sirena attiva',
        detail: `${name} è in funzione.`,
        instruction: 'Controlla la causa prima di intervenire sulla sirena.',
        priority: 1,
        changedAt,
      })
      continue
    }

    if (domain !== 'binary_sensor' || entity.state !== 'on') continue
    const deviceClass = String(entity.attributes?.device_class ?? '')
    const meta = BINARY_META[deviceClass]
    if (!meta) continue
    alerts.push({
      ...meta,
      id: `${meta.kind}:${entity.entity_id}`,
      entityId: entity.entity_id,
      detail: `${meta.detail} · ${name}`,
      changedAt,
    })
  }

  return alerts.sort((a, b) => a.priority - b.priority || a.entityId.localeCompare(b.entityId))
}
