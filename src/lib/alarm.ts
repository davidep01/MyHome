// Home Assistant AlarmControlPanelEntityFeature bitmask + helpers.

export interface ArmMode {
  id: string
  bit: number
  label: string
  service: string
  state: string
}

export const ARM_MODES: ArmMode[] = [
  { id: 'home', bit: 1, label: 'Casa', service: 'alarm_arm_home', state: 'armed_home' },
  { id: 'away', bit: 2, label: 'Fuori', service: 'alarm_arm_away', state: 'armed_away' },
  { id: 'night', bit: 4, label: 'Notte', service: 'alarm_arm_night', state: 'armed_night' },
  { id: 'vacation', bit: 32, label: 'Vacanza', service: 'alarm_arm_vacation', state: 'armed_vacation' },
  { id: 'bypass', bit: 16, label: 'Bypass', service: 'alarm_arm_custom_bypass', state: 'armed_custom_bypass' },
]

/** Arm modes actually supported by the entity (from `supported_features`). */
export function availableArmModes(supportedFeatures: number): ArmMode[] {
  return ARM_MODES.filter((m) => (supportedFeatures & m.bit) !== 0)
}

export const ALARM_STATE_LABELS: Record<string, string> = {
  disarmed: 'Disinserito',
  armed_home: 'Inserito · Casa',
  armed_away: 'Inserito · Fuori',
  armed_night: 'Inserito · Notte',
  armed_vacation: 'Inserito · Vacanza',
  armed_custom_bypass: 'Inserito · Bypass',
  arming: 'Inserimento…',
  pending: 'In attesa…',
  disarming: 'Disinserimento…',
  triggered: 'Allarme!',
}

export function alarmTone(state: string): { color: string; tint: string } {
  if (state === 'triggered') return { color: 'var(--danger-red)', tint: 'rgba(220,38,38,0.12)' }
  if (state === 'disarmed') return { color: 'var(--ok-green)', tint: 'rgba(21,128,61,0.10)' }
  return { color: 'var(--alert-orange)', tint: 'rgba(194,65,12,0.12)' } // armed / arming / pending
}

export const isArmed = (state: string) =>
  state.startsWith('armed') || state === 'triggered' || state === 'arming' || state === 'pending'
