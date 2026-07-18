import { afterEach, describe, expect, it, vi } from 'vitest'
import { alarmTestNeedsSync, ALARM_TEST_DURATION_MS, useAlarmTestStore } from './alarmTest'

describe('alarm test store', () => {
  afterEach(() => {
    useAlarmTestStore.getState().stop()
    vi.useRealTimers()
  })

  it('creates an isolated test alert and expires it automatically', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'))

    useAlarmTestStore.getState().sync({
      active: true,
      id: 'shared-1',
      scenario: 'intrusion',
      startedAt: '2026-07-18T12:00:00.000Z',
      expiresAt: '2026-07-18T12:00:20.000Z',
      serverNow: '2026-07-18T12:00:00.000Z',
    })
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
    useAlarmTestStore.getState().sync({
      active: true,
      id: 'shared-2',
      scenario: 'siren',
      startedAt: '2026-07-18T12:00:00.000Z',
      expiresAt: '2026-07-18T12:00:20.000Z',
      serverNow: '2026-07-18T12:00:00.000Z',
    })
    useAlarmTestStore.getState().sync({ active: false, serverNow: '2026-07-18T12:00:01.000Z' })
    vi.runAllTimers()

    expect(useAlarmTestStore.getState()).toMatchObject({ alert: null, expiresAt: null })
  })

  it('uses server-relative remaining time even when the kiosk clock differs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))

    useAlarmTestStore.getState().sync({
      active: true,
      id: 'shared-late',
      scenario: 'smoke',
      startedAt: '2026-07-18T12:00:00.000Z',
      expiresAt: '2026-07-18T12:00:20.000Z',
      serverNow: '2026-07-18T12:00:15.000Z',
    })

    vi.advanceTimersByTime(4_999)
    expect(useAlarmTestStore.getState().alert).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(useAlarmTestStore.getState().alert).toBeNull()
  })

  it('detects when the fallback heartbeat must converge the local kiosk', () => {
    const active = {
      active: true as const,
      id: 'shared-live',
      scenario: 'intrusion' as const,
      startedAt: '2026-07-18T12:00:00.000Z',
      expiresAt: '2026-07-18T12:00:20.000Z',
      serverNow: '2026-07-18T12:00:01.000Z',
    }

    expect(alarmTestNeedsSync(null, active)).toBe(true)
    expect(alarmTestNeedsSync('shared-live', active)).toBe(false)
    expect(alarmTestNeedsSync('old-test', active)).toBe(true)
    expect(alarmTestNeedsSync('shared-live', { active: false, serverNow: active.serverNow })).toBe(true)
    expect(alarmTestNeedsSync(null, { active: false, serverNow: active.serverNow })).toBe(false)
  })
})
