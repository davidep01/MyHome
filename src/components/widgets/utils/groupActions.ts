export type GroupControlKind = 'switch' | 'action' | 'activate'

export interface GroupCapability {
  kind: GroupControlKind
  onService: string
  offService?: string
  onLabel: string
  offLabel?: string
  holdToActivate?: boolean
}

const SWITCH = (onLabel = 'Accendi', offLabel = 'Spegni'): GroupCapability => ({
  kind: 'switch',
  onService: 'turn_on',
  offService: 'turn_off',
  onLabel,
  offLabel,
})

const CAPABILITIES: Record<string, GroupCapability> = {
  light: SWITCH(),
  switch: SWITCH(),
  input_boolean: SWITCH(),
  fan: SWITCH(),
  humidifier: SWITCH(),
  siren: { ...SWITCH('Attiva', 'Disattiva'), holdToActivate: true },
  automation: SWITCH('Attiva', 'Disattiva'),
  remote: SWITCH(),
  climate: SWITCH(),
  water_heater: SWITCH(),
  media_player: SWITCH(),
  cover: { kind: 'action', onService: 'open_cover', offService: 'close_cover', onLabel: 'Apri', offLabel: 'Chiudi' },
  valve: { kind: 'action', onService: 'open_valve', offService: 'close_valve', onLabel: 'Apri', offLabel: 'Chiudi' },
  vacuum: { kind: 'action', onService: 'start', offService: 'return_to_base', onLabel: 'Avvia', offLabel: 'Rientra' },
  lawn_mower: { kind: 'action', onService: 'start_mowing', offService: 'dock', onLabel: 'Avvia', offLabel: 'Rientra' },
  scene: { kind: 'activate', onService: 'turn_on', onLabel: 'Attiva' },
  script: { kind: 'activate', onService: 'turn_on', onLabel: 'Esegui' },
  button: { kind: 'activate', onService: 'press', onLabel: 'Premi' },
  input_button: { kind: 'activate', onService: 'press', onLabel: 'Premi' },
}

export function entityDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

/** Commands are safe only when every configured member uses the same HA domain. */
export function homogeneousGroupDomain(entityIds: string[]): string | null {
  if (entityIds.length === 0) return null
  const first = entityDomain(entityIds[0])
  return first && entityIds.every((id) => entityDomain(id) === first) ? first : null
}

export function groupCapability(domain: string | null): GroupCapability | null {
  return domain ? CAPABILITIES[domain] ?? null : null
}

export function groupMemberActive(domain: string, state: string | undefined): boolean {
  if (!state || state === 'unavailable' || state === 'unknown') return false
  switch (domain) {
    case 'cover':
    case 'valve':
      return state === 'open' || state === 'opening'
    case 'media_player':
      return !['off', 'standby'].includes(state)
    case 'climate':
    case 'water_heater':
      return state !== 'off'
    case 'vacuum':
      return state === 'cleaning'
    case 'lawn_mower':
      return state === 'mowing'
    case 'lock':
      return state === 'unlocked'
    default:
      return state === 'on'
  }
}

/** Undefined means HA must report the real restored state (e.g. climate). */
export function optimisticGroupState(domain: string, turningOn: boolean): string | undefined {
  switch (domain) {
    case 'cover': return turningOn ? 'opening' : 'closing'
    case 'valve': return turningOn ? 'opening' : 'closing'
    case 'vacuum': return turningOn ? 'cleaning' : 'returning'
    case 'lawn_mower': return turningOn ? 'mowing' : 'returning'
    case 'media_player': return turningOn ? 'idle' : 'off'
    case 'climate':
    case 'water_heater':
      return undefined
    default:
      return turningOn ? 'on' : 'off'
  }
}
