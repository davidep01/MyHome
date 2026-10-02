import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { summarizeRoom } from './useRoomsOverview'
const climate = (temperature: unknown, action: string) => ({ entity_id: 'climate.room', state: 'heat', last_changed: '', last_updated: '', context: { id: '', user_id: null, parent_id: null }, attributes: { current_temperature: temperature, temperature_unit: '°F', hvac_action: action } }) as HassEntity
describe('room climate summary', () => {
  it('does not animate or count a thermostat paused in heat mode', () => {
    const room = summarizeRoom('room', 'Stanza', [climate(68, 'idle')])
    expect(room).toMatchObject({ heating: false, activity: null, active: 0, temperature: 68, temperatureUnit: '°F' })
    expect(summarizeRoom('room', 'Stanza', [climate(68, 'heating')])).toMatchObject({ heating: true, activity: 'heating', active: 1 })
  })
  it('does not manufacture temperature zero from null', () => {
    expect(summarizeRoom('room', 'Stanza', [climate(null, 'idle')]).temperature).toBeNull()
    expect(summarizeRoom('room', 'Stanza', [climate(0, 'idle')]).temperature).toBe(0)
  })
})
