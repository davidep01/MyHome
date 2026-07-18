import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALARM_TEST_DURATION_MS, useAlarmTestStore } from './alarmTest'

describe('alarm test store', () => {
  afterEach(() => {
    useAlarmTestStore.getState().stop()
    vi.useRealTimers()
  })

  it('creates an isolated test alert and expires it automatically', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'))

    useAlarmTestStore.getState().start('intrusion')
    expect(useAlarmTestStore.getState().alert).toMatchObject({
      kind: 'intrusion',
      test: true,
      entityId: 'test_alarm.intrusion',
    })

    vi.advanceTimersByTime(ALARM_TEST_DURATION_MS)
    expect(useAlarmTestStore.getState().alert).toBeNull()
  })

  it('stops immediately without leaving the expiry timer active', () => {
    vi.useFakeTimers()
    useAlarmTestStore.getState().start('siren')
    useAlarmTestStore.getState().stop()
    vi.runAllTimers()

    expect(useAlarmTestStore.getState()).toMatchObject({ alert: null, expiresAt: null })
  })
})
