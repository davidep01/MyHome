import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { controlRange, snapControlValue, dialControlValue } from './controlRange'
import { getClimateControls, formatClimateTemp } from './climate'

const climate = (attributes: Record<string, unknown>) => ({ entity_id: 'climate.test', state: 'heat', attributes }) as HassEntity

describe('touch control limits and climate increments', () => {
  it('does not jump between endpoints when crossing the gap below the wheel', () => {
    expect(dialControlValue(179, 35, 7, 35, 0.5)).toBe(35)
    expect(dialControlValue(-179, 35, 7, 35, 0.5)).toBe(35)
    expect(dialControlValue(179, 7, 7, 35, 0.5)).toBe(7)
    expect(dialControlValue(-179, 7, 7, 35, 0.5)).toBe(7)
  })
  it('maps the top of the arc to the middle of the range', () => expect(dialControlValue(0, 21, 7, 35, 0.5)).toBe(21))
  it('shows the full quarter-degree target in Italian', () => expect(formatClimateTemp(20.25)).toBe('20,25°C'))
  it('preserves quarter-degree steps' , () => expect(snapControlValue(20.25, 7, 35, 0.25)).toBe(20.25))
  it('anchors snapping to the device minimum', () => expect(snapControlValue(7.65, 7.25, 35, 0.5)).toBe(7.75))
  it('limits values at both ends', () => {
    expect(snapControlValue(-100, 7, 35, 0.5)).toBe(7)
    expect(snapControlValue(100, 7, 35, 0.5)).toBe(35)
  })
  it('does not leak floating-point artefacts', () => expect(snapControlValue(0.3, 0, 1, 0.1)).toBe(0.3))
  it('handles zero, invalid steps and reversed bounds safely', () => {
    expect(controlRange(20, 7, 0)).toEqual({ min: 20, max: 20, step: 1 })
    expect(snapControlValue(NaN, 7, 35, NaN)).toBe(7)
  })
  it.each([null, undefined, '', false])('does not enable a fabricated target for %s', (temperature) => {
    expect(getClimateControls(climate({ temperature, current_temperature: 22 }))).toMatchObject({ target: undefined, adjustable: false })
  })
  it('uses Fahrenheit bounds and the entity unit', () => {
    expect(getClimateControls(climate({ temperature_unit: '°F', temperature: 72 }))).toMatchObject({ min: 45, max: 95, step: 1, unit: '°F', adjustable: true })
  })
  it('disables temperature adjustment when the integration supplies an invalid range or step', () => {
    expect(getClimateControls(climate({ temperature: 22, min_temp: 35, max_temp: 7 })).adjustable).toBe(false)
    expect(getClimateControls(climate({ temperature: 22, target_temp_step: 0 })).adjustable).toBe(false)
  })
})
