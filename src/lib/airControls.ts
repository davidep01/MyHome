import { controlRange, snapControlValue } from './controlRange'

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Declared HA features take precedence over attributes from an older snapshot. */
export function fanControls(attrs: Record<string, unknown>) {
  const features = numeric(attrs.supported_features)
  const supports = (flag: number, fallback: boolean) => features === undefined ? fallback : (features & flag) !== 0
  const modes = Array.isArray(attrs.preset_modes)
    ? attrs.preset_modes.filter((mode): mode is string => typeof mode === 'string' && mode.length > 0)
    : []
  const speeds = numeric(attrs.speed_count)
  const step = numeric(attrs.percentage_step) ?? (speeds && speeds > 0 ? 100 / speeds : 1)
  return {
    speed: supports(1, numeric(attrs.percentage) !== undefined),
    presets: modes.length > 0 && supports(8, true),
    modes,
    oscillation: supports(2, typeof attrs.oscillating === 'boolean'),
    direction: supports(4, ['forward', 'reverse'].includes(String(attrs.direction))),
    step: step > 0 ? step : 1,
  }
}

export function fanPercentage(value: number, attrs: Record<string, unknown>): number {
  const step = fanControls(attrs).step
  const finite = Number.isFinite(value) ? value : 0
  // HA expects an integer percentage, even for a three-speed fan (33/67/100).
  return Math.max(0, Math.min(100, Math.round(Math.round(finite / step) * step)))
}

export function humidityRange(attrs: Record<string, unknown>) {
  const min = Math.max(0, Math.min(100, numeric(attrs.min_humidity) ?? 0))
  const max = Math.max(0, Math.min(100, numeric(attrs.max_humidity) ?? 100))
  return controlRange(Math.min(min, max), Math.max(min, max), numeric(attrs.target_humidity_step) ?? 1)
}

export function humidityTarget(value: number, attrs: Record<string, unknown>): number {
  const range = humidityRange(attrs)
  return snapControlValue(value, range.min, range.max, range.step)
}

export function humidityModes(attrs: Record<string, unknown>): string[] {
  const features = numeric(attrs.supported_features)
  if (features !== undefined && !(features & 1)) return []
  return Array.isArray(attrs.available_modes)
    ? attrs.available_modes.filter((mode): mode is string => typeof mode === 'string' && mode.trim().length > 0)
    : []
}
