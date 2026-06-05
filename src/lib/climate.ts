import type { HassEntity } from 'home-assistant-js-websocket'

const ACTIVE_ACTIONS = new Set(['heating', 'cooling', 'drying', 'fan'])
const IDLE_ACTIONS = new Set(['idle', 'off'])

const HVAC_MODE_LABELS: Record<string, string> = {
  off: 'OFF',
  heat: 'CALDO',
  cool: 'FREDDO',
  auto: 'AUTO',
  dry: 'DRY',
  fan_only: 'VENTOLA',
  heat_cool: 'CALDO/FREDDO',
}

const HVAC_ACTION_LABELS: Record<string, string> = {
  heating: 'Riscalda',
  cooling: 'Raffresca',
  drying: 'Deumidifica',
  fan: 'Ventila',
  idle: 'In pausa',
  off: 'Spento',
}

const OPTION_LABELS: Record<string, string> = {
  auto: 'Auto',
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta',
  swing: 'Swing',
  '1_up': '1 alto',
  '5_down': '5 basso',
}

export type ClimateTone = 'heating' | 'cooling' | 'drying' | 'fan' | 'idle' | 'off' | 'unavailable'

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function getClimateModes(entity?: HassEntity | null): string[] {
  const modes = stringList(entity?.attributes?.hvac_modes)
  const state = entity?.state
  if (!modes.length && state && !['unknown', 'unavailable'].includes(state)) modes.push(state)
  if (!modes.includes('off')) modes.unshift('off')
  return [...new Set(modes)]
}

export function getHvacModeLabel(mode?: string | null): string {
  if (!mode) return '--'
  return HVAC_MODE_LABELS[mode] ?? mode.replace(/_/g, ' ').toUpperCase()
}

export function getClimateOptionLabel(value?: string | null): string {
  if (!value) return '--'
  return OPTION_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function getClimateVisualState(entity?: HassEntity | null) {
  const mode = entity?.state ?? 'unknown'
  const rawAction = typeof entity?.attributes?.hvac_action === 'string' ? entity.attributes.hvac_action : undefined
  const unavailable = !entity || mode === 'unavailable' || mode === 'unknown'
  const isOff = mode === 'off'
  const activeAction = rawAction && ACTIVE_ACTIONS.has(rawAction) ? rawAction : undefined
  const idleAction = rawAction && IDLE_ACTIONS.has(rawAction) ? rawAction : undefined
  const tone: ClimateTone = unavailable
    ? 'unavailable'
    : activeAction === 'heating'
      ? 'heating'
      : activeAction === 'cooling'
        ? 'cooling'
        : activeAction === 'drying'
          ? 'drying'
          : activeAction === 'fan'
            ? 'fan'
            : isOff
              ? 'off'
              : 'idle'

  return {
    mode,
    modeLabel: getHvacModeLabel(mode),
    rawAction,
    activeAction,
    tone,
    isOn: !unavailable && !isOff,
    unavailable,
    onOffLabel: unavailable ? 'N/D' : isOff ? 'OFF' : 'ON',
    actionLabel: unavailable
      ? 'Non disponibile'
      : activeAction
        ? HVAC_ACTION_LABELS[activeAction] ?? activeAction
        : idleAction
          ? HVAC_ACTION_LABELS[idleAction]
          : isOff
            ? 'Spento'
            : 'In pausa',
  }
}

export function pickOnHvacMode(modes: string[], currentMode?: string | null): string {
  if (currentMode && !['off', 'unknown', 'unavailable'].includes(currentMode) && modes.includes(currentMode)) {
    return currentMode
  }
  const preferred = ['heat_cool', 'auto', 'cool', 'heat', 'dry', 'fan_only']
  return preferred.find((mode) => modes.includes(mode)) ?? modes.find((mode) => mode !== 'off') ?? 'heat'
}

export function formatClimateTemp(value: unknown, unit = '°C'): string {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(1)}${unit}` : `--${unit}`
}
