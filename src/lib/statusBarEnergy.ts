import type { HassEntity } from 'home-assistant-js-websocket'

const CONNECTED_WALLBOX_STATES = new Set([
  'connected', 'charging', 'plugged', 'plugged_in', 'occupied', 'preparing', 'finishing',
])

export function isWallboxConnected(entity?: HassEntity): boolean {
  if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') return false
  return CONNECTED_WALLBOX_STATES.has(entity.state.trim().toLowerCase())
}

export function formatHousePower(entity?: HassEntity): string | null {
  if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') return null
  const raw = Number(entity.state)
  if (!Number.isFinite(raw)) return null
  const unit = String(entity.attributes?.unit_of_measurement ?? 'W').trim().toLowerCase()
  if (unit === 'kw') {
    const digits = Math.abs(raw) < 10 ? 2 : 1
    return `${raw.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kW`
  }
  const watts = unit === 'mw' ? raw * 1_000_000 : raw
  if (Math.abs(watts) >= 1_000) {
    const kilowatts = watts / 1_000
    const digits = Math.abs(kilowatts) < 10 ? 2 : 1
    return `${kilowatts.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kW`
  }
  return `${Math.round(watts).toLocaleString('it-IT')} W`
}
