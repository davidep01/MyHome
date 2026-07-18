import { describe, expect, it } from 'vitest'
import { temperatureTone, widgetTones } from './getRingColorScale'

describe('temperatureTone', () => {
  it.each([
    [18, widgetTones.cool],
    [19, widgetTones.ok],
    [24.5, widgetTones.ok],
    [25, widgetTones.heat],
    [29, widgetTones.critical],
  ])('maps %s °C to its visual temperature band', (temperature, expected) => {
    expect(temperatureTone(temperature)).toBe(expected)
  })
})
