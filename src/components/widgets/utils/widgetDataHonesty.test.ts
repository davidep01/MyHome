import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import type { RoomEntity } from '../../../api/backend'
import { numericState, formatNumber, formatPower } from './formatWidgetValue'
import { airQualityTone, temperatureTone, widgetTones } from './getRingColorScale'
import { mapEntityToWidgetCard } from './mapEntityToWidgetCard'

function map(id: string, state: string, attributes: Record<string, unknown> = {}) {
  const entity = { entity_id: id, state, attributes, last_changed: '', last_updated: '', context: { id: 'test', parent_id: null, user_id: null } } satisfies HassEntity
  const room = { id, entityId: id, roomId: 'test', label: 'Test', type: 'sensor', sortOrder: 0 } satisfies RoomEntity
  return mapEntityToWidgetCard(entity, room)
}

describe('widget data honesty', () => {
  it.each([null, undefined, '', ' ', false, true, [], {}, 'unavailable', Infinity, NaN])('does not invent zero for %s', (value) => {
    expect(numericState(value)).toBeUndefined()
    expect(formatNumber(value)).toBe('—')
  })

  it('preserves real zero and uses Italian number formatting', () => {
    expect(numericState(0)).toBe(0)
    expect(numericState('0')).toBe(0)
    expect(formatNumber(1234567.5, 1)).toBe('1.234.567,5')
    expect(formatPower(2870)).toBe('2,9 kW')
  })

  it('shows valve position as a physical state, not a missing numeric sensor', () => {
    expect(map('valve.water', 'open')).toMatchObject({ family: 'water', state: 'Aperta', isActive: true })
    expect(map('valve.water', 'closing')).toMatchObject({ state: 'In chiusura', status: 'closing' })
  })

  it('distinguishes jammed and transitioning locks from locked', () => {
    expect(map('lock.door', 'jammed')).toMatchObject({ state: 'Inceppata', status: 'error', accentColor: widgetTones.critical.color })
    expect(map('lock.door', 'unlocking')).toMatchObject({ state: 'In sblocco', status: 'warning' })
    expect(map('lock.door', 'locked')).toMatchObject({ state: 'Bloccata', status: 'locked' })
  })

  it('does not confuse disarmed with armed', () => {
    expect(map('alarm_control_panel.home', 'disarmed').status).toBe('disarmed')
    expect(map('alarm_control_panel.home', 'armed_away').status).toBe('armed')
  })

  it('does not invent full brightness or expose a slider when a light has no brightness measurement', () => {
    expect(map('light.binary', 'on')).toMatchObject({ state: 'Accesa', percent: undefined })
    expect(map('light.binary', 'on', { brightness: null })).toMatchObject({ state: 'Accesa', percent: undefined })
  })

  it('does not invent full speed when a fan has no percentage measurement', () => {
    expect(map('fan.binary', 'on')).toMatchObject({ state: 'Acceso', percent: undefined })
    expect(map('fan.binary', 'on', { percentage: null })).toMatchObject({ state: 'Acceso', percent: undefined })
  })

  it('normalizes Fahrenheit only for temperature colour, preserving the displayed unit', () => {
    expect(temperatureTone(72, '°F')).toEqual(temperatureTone((72 - 32) * 5 / 9, '°C'))
    expect(temperatureTone(295.15, 'K')).toEqual(temperatureTone(22, '°C'))
    expect(temperatureTone(72, 'unrecognized')).toEqual(widgetTones.neutral)
    expect(map('sensor.temp', '72', { device_class: 'temperature', unit_of_measurement: '°F' }).unit).toBe('°F')
  })

  it('does not reuse CO2 thresholds for particulate matter or VOC', () => {
    expect(airQualityTone(150, 'pm25')).toEqual(widgetTones.neutral)
    expect(airQualityTone(2000, 'volatile_organic_compounds')).toEqual(widgetTones.neutral)
    expect(airQualityTone(2000, 'carbon_dioxide')).not.toEqual(widgetTones.neutral)
  })
})
