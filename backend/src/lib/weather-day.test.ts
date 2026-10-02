import { describe, expect, it } from 'vitest'
import { weatherDay } from './weather-day.js'
const at = (value: string) => Date.parse(value) / 1000
describe('weather location calendar day', () => {
  it('groups by the weather location rather than server or browser timezone', () => {
    expect(weatherDay(at('2026-10-02T00:30:00Z'), 40.7128, -74.006).date).toBe('2026-10-01')
    expect(weatherDay(at('2026-10-02T00:30:00Z'), 35.6762, 139.6503).date).toBe('2026-10-02')
  })
  it('uses IANA rules across the daylight saving transition', () => {
    expect(weatherDay(at('2026-10-24T22:30:00Z'), 45.4642, 9.19).date).toBe('2026-10-25')
    expect(weatherDay(at('2026-10-25T22:30:00Z'), 45.4642, 9.19).date).toBe('2026-10-25')
    expect(weatherDay(at('2026-10-25T22:30:00Z'), 45.4642, 9.19).timeZone).toBe('Europe/Rome')
  })
})
