import type { HassEntities } from 'home-assistant-js-websocket'
import type { WeatherCurrent } from '../api/weather'
import { stateLabel } from '../components/widgets/utils/stateLabel'

const CONDITION_ICON: Record<string, string> = {
  sunny: '01d',
  'clear-night': '01n',
  partlycloudy: '02d',
  cloudy: '03d',
  fog: '50d',
  rainy: '10d',
  pouring: '09d',
  snowy: '13d',
  'snowy-rainy': '13d',
  hail: '13d',
  lightning: '11d',
  'lightning-rainy': '11d',
  windy: '50d',
  'windy-variant': '50d',
  exceptional: '11d',
}

function finite(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function windSpeedKmh(value: number, unit: unknown): number {
  const normalized = String(unit ?? 'km/h').toLowerCase()
  if (normalized === 'm/s') return Math.round(value * 36) / 10
  if (normalized === 'mph') return Math.round(value * 16.0934) / 10
  return value
}

/** Adapts HA's native weather entity to the existing kiosk weather contract. */
export function currentWeatherFromHA(entities: HassEntities): WeatherCurrent | null {
  const source = Object.values(entities)
    .filter((entity) => entity.entity_id.startsWith('weather.')
      && entity.state !== 'unavailable'
      && entity.state !== 'unknown')
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))[0]
  if (!source) return null

  const temperature = finite(source.attributes?.temperature)
  if (temperature === null) return null
  const humidity = finite(source.attributes?.humidity)
  const wind = finite(source.attributes?.wind_speed)
  const name = String(source.attributes?.friendly_name ?? 'Casa')
    .replace(/^(forecast|meteo)\s+/i, '')
    .trim() || 'Casa'

  return {
    temp: temperature,
    feels_like: finite(source.attributes?.apparent_temperature) ?? temperature,
    humidity: humidity ?? 0,
    description: stateLabel(source.state),
    icon: CONDITION_ICON[source.state] ?? '03d',
    wind_speed: wind === null ? 0 : windSpeedKmh(wind, source.attributes?.wind_speed_unit),
    city: name,
  }
}
