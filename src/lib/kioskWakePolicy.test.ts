import { describe, expect, it } from 'vitest'
import { MANUAL_SCREEN_OFF_MS, wakeAllowed } from './kioskWakePolicy'
describe('standby wake priorities', () => {
  it('holds off automatic sensors after manual screen-off, with emergency and explicit wake priority', () => {
    for (const reason of ['motion', 'presence', 'light', 'proximity'] as const) {
      expect(wakeAllowed(reason, MANUAL_SCREEN_OFF_MS, false, 1000)).toBe(false)
      expect(wakeAllowed(reason, MANUAL_SCREEN_OFF_MS, false, MANUAL_SCREEN_OFF_MS)).toBe(true)
      expect(wakeAllowed(reason, MANUAL_SCREEN_OFF_MS, true, 1000)).toBe(true)
    }
    for (const reason of ['touch', 'remote', 'native', 'doorbell', 'emergency'] as const) {
      expect(wakeAllowed(reason, MANUAL_SCREEN_OFF_MS, false, 1000)).toBe(true)
    }
  })
})
