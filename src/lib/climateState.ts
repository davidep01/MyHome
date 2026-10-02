/** HA action describes actual work; mode is only a fallback when action is absent. */
export function climateAction(state: string, attributes: Record<string, unknown> = {}): string {
  if (['off', 'unavailable', 'unknown'].includes(state)) return 'off'
  const action = attributes.hvac_action
  if (typeof action === 'string' && ['off', 'idle', 'heating', 'cooling', 'drying', 'fan', 'defrosting'].includes(action)) return action
  return state === 'heat' ? 'heating' : state === 'cool' ? 'cooling' : state === 'dry' ? 'drying' : state === 'fan_only' ? 'fan' : 'idle'
}

export function temperatureValue(value: unknown, unit: unknown): { value: number; unit: string } | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || typeof unit !== 'string' || !['°C', '°F', 'K'].includes(unit)) return null
  return { value: parsed, unit }
}
