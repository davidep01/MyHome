import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { formatHousePower, isWallboxConnected } from './statusBarEnergy'

function entity(state: string, unit?: string): HassEntity {
  return {
    entity_id: 'sensor.test',
    state,
    attributes: unit ? { unit_of_measurement: unit } : {},
    last_changed: '',
    last_updated: '',
    context: { id: '', parent_id: null, user_id: null },
  }
}

describe('status bar energy', () => {
  it('shows the wallbox only for connected charging states', () => {
    expect(isWallboxConnected(entity('CONNECTED'))).toBe(true)
    expect(isWallboxConnected(entity('charging'))).toBe(true)
    expect(isWallboxConnected(entity('DISCONNECTED'))).toBe(false)
    expect(isWallboxConnected(entity('unavailable'))).toBe(false)
  })

  it('formats live house consumption using the source unit', () => {
    expect(formatHousePower(entity('0.21', 'kW'))).toBe('0,21 kW')
    expect(formatHousePower(entity('1.234', 'kW'))).toBe('1,23 kW')
    expect(formatHousePower(entity('1540', 'W'))).toBe('1,54 kW')
    expect(formatHousePower(entity('unavailable', 'kW'))).toBeNull()
  })
})
