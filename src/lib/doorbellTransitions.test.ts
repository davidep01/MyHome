import { describe, expect, it } from 'vitest'
import { doorbellTriggered } from './doorbellTransitions'
const now = Date.parse('2026-10-02T12:00:00Z')
const stamp = new Date(now).toISOString()
describe('doorbell transitions', () => {
  it('requires a valid baseline and recent rising edge', () => {
    expect(doorbellTriggered('binary_sensor.bell', 'off', 'on', stamp, now)).toBe(true)
    for (const previous of [undefined, 'unknown', 'unavailable', 'on']) expect(doorbellTriggered('binary_sensor.bell', previous, 'on', stamp, now)).toBe(false)
    expect(doorbellTriggered('binary_sensor.bell', 'off', 'on', '2020-01-01T00:00:00Z', now)).toBe(false)
  })
  it('never treats unavailable, recovery, invalid or old event timestamps as a press', () => {
    const previous = new Date(now - 1000).toISOString()
    expect(doorbellTriggered('event.bell', previous, stamp, stamp, now)).toBe(true)
    for (const state of ['unavailable', 'unknown', 'invalid', '2020-01-01T00:00:00Z']) expect(doorbellTriggered('event.bell', previous, state, stamp, now)).toBe(false)
    expect(doorbellTriggered('event.bell', 'unavailable', stamp, stamp, now)).toBe(false)
  })
})
