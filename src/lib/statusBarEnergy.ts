import type { HassEntity } from 'home-assistant-js-websocket'

export type WallboxMode = 'hidden' | 'connected' | 'charging'

const CHARGING_WALLBOX_STATES = new Set([
  'charging', 'charging_active', 'delivering', 'boosting', 'running',
])
const CONNECTED_WALLBOX_STATES = new Set([
  'connected', 'plugged', 'plugged_in', 'occupied', 'preparing', 'finishing',
  'ready', 'waiting', 'paused', 'not_charging', 'charge_complete', 'charged',
  'suspended', 'suspended_ev', 'suspended_evse',
])
const DISCONNECTED_WALLBOX_STATES = new Set([
  'disconnected', 'not_connected', 'unplugged', 'available', 'idle', 'offline', 'off',
])

function normalizedState(entity?: HassEntity): string {
  return entity?.state.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? ''
}

export function wallboxMode(entity?: HassEntity): WallboxMode {
  const state = normalizedState(entity)
  if (!state || state === 'unavailable' || state === 'unknown' || DISCONNECTED_WALLBOX_STATES.has(state)) return 'hidden'
  if (CHARGING_WALLBOX_STATES.has(state)) return 'charging'
  if (CONNECTED_WALLBOX_STATES.has(state)) return 'connected'
  if (state.includes('charging') && !state.includes('not_charging')) return 'charging'
  return 'hidden'
}

export function isWallboxConnected(entity?: HassEntity): boolean {
  return wallboxMode(entity) !== 'hidden'
}

export function powerValueInKw(state: unknown, unitValue: unknown = 'W'): number | null {
  if (state === 'unavailable' || state === 'unknown') return null
  const raw = Number(state)
  if (!Number.isFinite(raw)) return null
  const unit = String(unitValue ?? 'W').trim().toLowerCase()
  if (unit === 'kw') return raw
  if (unit === 'mw') return raw * 1_000
  return raw / 1_000
}

export function powerInKw(entity?: HassEntity): number | null {
  if (!entity) return null
  return powerValueInKw(entity.state, entity.attributes?.unit_of_measurement)
}

export function formatHousePower(entity?: HassEntity): string | null {
  const kilowatts = powerInKw(entity)
  if (kilowatts === null) return null
  const unit = String(entity?.attributes?.unit_of_measurement ?? 'W').trim().toLowerCase()
  if (unit === 'kw') {
    const digits = Math.abs(kilowatts) < 10 ? 2 : 1
    return `${kilowatts.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kW`
  }
  const watts = kilowatts * 1_000
  if (Math.abs(watts) >= 1_000) {
    const digits = Math.abs(kilowatts) < 10 ? 2 : 1
    return `${kilowatts.toLocaleString('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits })} kW`
  }
  return `${Math.round(watts).toLocaleString('it-IT')} W`
}

export interface EnergyWindow {
  limitKw: 3 | 6
  warningKw: 2.5 | 5.5
  label: string
  extended: boolean
}

interface ItalianDateParts {
  year: number
  month: number
  day: number
  hour: number
  weekday: string
}

function italianDateParts(at: Date): ItalianDateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  })
  const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), weekday: parts.weekday,
  }
}

/** Meeus/Jones/Butcher: data della Pasqua gregoriana, usata per Pasquetta. */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  return { month, day: ((h + l - 7 * m + 114) % 31) + 1 }
}

function isItalianPublicHoliday(parts: ItalianDateParts): boolean {
  const fixed = new Set(['1-1', '1-6', '4-25', '5-1', '6-2', '8-15', '11-1', '12-8', '12-25', '12-26'])
  if (fixed.has(`${parts.month}-${parts.day}`)) return true
  const easter = easterSunday(parts.year)
  const easterUtc = Date.UTC(parts.year, easter.month - 1, easter.day)
  const monday = new Date(easterUtc + 86_400_000)
  return parts.month === monday.getUTCMonth() + 1 && parts.day === monday.getUTCDate()
}

/** Fascia contrattuale calcolata sempre sull'ora italiana del domicilio. */
export function energyWindowAt(at: Date): EnergyWindow {
  const parts = italianDateParts(at)
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'
  const holiday = isItalianPublicHoliday(parts)
  const night = parts.hour >= 23 || parts.hour < 7
  if (weekend || holiday || night) {
    return {
      limitKw: 6,
      warningKw: 5.5,
      label: holiday ? 'Festivo · soglia estesa' : weekend ? 'Weekend · soglia estesa' : 'Fascia 23–07',
      extended: true,
    }
  }
  return { limitKw: 3, warningKw: 2.5, label: 'Feriale 07–23', extended: false }
}

export function isEnergyRisk(powerKw: number | null, window: EnergyWindow): boolean {
  return powerKw !== null && powerKw >= window.warningKw
}
