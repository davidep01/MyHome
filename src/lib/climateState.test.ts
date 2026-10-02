import { describe, expect, it } from 'vitest'
import { climateAction, temperatureValue } from './climateState'
describe('climate action and temperature evidence', () => {
  it('prioritizes HVAC action and falls back only when it is absent or invalid', () => {
    expect(climateAction('heat', { hvac_action: 'idle' })).toBe('idle')
    expect(climateAction('heat', { hvac_action: 'heating' })).toBe('heating')
    expect(climateAction('heat')).toBe('heating')
    expect(climateAction('unavailable', { hvac_action: 'heating' })).toBe('off')
  })
  it('preserves zero and explicit units while rejecting missing data', () => {
    expect(temperatureValue(0, '°C')).toEqual({ value: 0, unit: '°C' })
    expect(temperatureValue('68', '°F')).toEqual({ value: 68, unit: '°F' })
    for (const value of [null, undefined, '', ' ', NaN]) expect(temperatureValue(value, '°C')).toBeNull()
    expect(temperatureValue(22, undefined)).toBeNull()
  })
})
