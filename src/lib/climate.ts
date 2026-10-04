import { controlRange, snapControlValue } from './controlRange'
import { supportsCardFeature } from './cardCapabilities'
import { temperatureValue } from './climateState'
import type { HassEntity } from 'home-assistant-js-websocket'

const ACTIVE_ACTIONS = new Set(['heating', 'cooling', 'drying', 'fan'])
const IDLE_ACTIONS = new Set(['idle', 'off'])

const HVAC_MODE_LABELS: Record<string, string> = {
  off: 'Spento',
  heat: 'Caldo',
  cool: 'Freddo',
  auto: 'Auto',
  dry: 'Deumidifica',
  fan_only: 'Ventola',
  heat_cool: 'Auto caldo/freddo',
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
  swing: 'Oscillazione',
  vertical: 'Verticale',
  horizontal: 'Orizzontale',
  comfort: 'Comfort',
  eco: 'Eco',
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
              : mode === 'heat'
                ? 'heating'
                : mode === 'cool'
                  ? 'cooling'
                  : mode === 'dry'
                    ? 'drying'
                    : mode === 'fan_only'
                      ? 'fan'
                      : 'idle'

  return {
    mode,
    modeLabel: getHvacModeLabel(mode),
    rawAction,
    activeAction,
    tone,
    isOn: !unavailable && !isOff,
    unavailable,
    onOffLabel: unavailable ? 'N/D' : isOff ? 'Spento' : 'Acceso',
    actionLabel: unavailable
      ? 'Non disponibile'
      : activeAction
        ? HVAC_ACTION_LABELS[activeAction] ?? activeAction
        : idleAction
          ? HVAC_ACTION_LABELS[idleAction]
          : isOff
            ? 'Spento'
            : `Modalità ${getHvacModeLabel(mode).toLocaleLowerCase('it')}`,
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
  const n = temperatureValue(value, unit)?.value
  return n !== undefined ? `${n.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 6 })}${unit}` : `--${unit}`
}


/** Controls use the entity's unit and never synthesize a missing target. */
export function getClimateControls(entity?: HassEntity | null) {
  const attrs = entity?.attributes ?? {}
  const unit = typeof attrs.temperature_unit === 'string' && ['°C', '°F', 'K'].includes(attrs.temperature_unit) ? attrs.temperature_unit : '°C'
  const read = (value: unknown) => temperatureValue(value, unit)?.value
  const defaults = unit === '°F' ? [45, 95] : unit === 'K' ? [280, 308] : [7, 35]
  const min = read(attrs.min_temp) ?? defaults[0]
  const max = read(attrs.max_temp) ?? defaults[1]
  const step = read(attrs.target_temp_step) ?? (unit === '°F' ? 1 : 0.5)
  const range = controlRange(min, max, step)
  const target = read(attrs.temperature)
  return { ...range, unit, current: read(attrs.current_temperature), target,
    adjustable: supportsCardFeature(attrs, 1, true) && target !== undefined && max > min && step > 0 }
}

export { snapControlValue as snapClimateTemperature }
