import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { currentWeatherFromHA } from './haWeather'

function weather(state: string, attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: 'weather.forecast_casa',
    state,
    attributes,
    last_changed: '2026-08-30T12:00:00Z',
    last_updated: '2026-08-30T12:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

describe('Home Assistant weather fallback', () => {
  it('maps a live HA weather entity to the kiosk weather contract', () => {
    const source = weather('clear-night', {
      temperature: 26.1,
      humidity: 78,
      wind_speed: 9.4,
      wind_speed_unit: 'km/h',
      friendly_name: 'Forecast Casa',
    })

    expect(currentWeatherFromHA({ [source.entity_id]: source } as HassEntities)).toEqual({
      temp: 26.1,
      feels_like: 26.1,
      humidity: 78,
      description: 'Sereno',
      icon: '01n',
      wind_speed: 9.4,
      city: 'Casa',
    })
  })

  it('ignores unavailable or malformed weather entities', () => {
    const source = weather('unavailable', { temperature: 26 })
    expect(currentWeatherFromHA({ [source.entity_id]: source } as HassEntities)).toBeNull()
  })
})
