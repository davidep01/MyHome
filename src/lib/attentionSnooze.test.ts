import { describe, expect, it } from 'vitest'
import { isSnoozed, pruneExpired } from './attentionSnooze'

const NOW = Date.parse('2026-06-10T15:00:00Z')

describe('isSnoozed', () => {
  it('is not snoozed with no entry', () => {
    expect(isSnoozed({ id: 'a', fingerprint: 'f' }, {}, NOW)).toBe(false)
  })

  it('honors a timed snooze until it expires', () => {
    const snoozes = { a: { until: NOW + 1000 } }
    expect(isSnoozed({ id: 'a', fingerprint: 'f' }, snoozes, NOW)).toBe(true)
    expect(isSnoozed({ id: 'a', fingerprint: 'f' }, snoozes, NOW + 2000)).toBe(false)
  })

  it('honors a fingerprint snooze only while the fingerprint matches', () => {
    const snoozes = { a: { fingerprint: 'warning' } }
    expect(isSnoozed({ id: 'a', fingerprint: 'warning' }, snoozes, NOW)).toBe(true)
    expect(isSnoozed({ id: 'a', fingerprint: 'critical' }, snoozes, NOW)).toBe(false)
  })
})

describe('pruneExpired', () => {
  it('drops a timed snooze once it has expired', () => {
    const snoozes = { a: { until: NOW - 1000 }, b: { until: NOW + 1000 } }
    const items = [{ id: 'a', fingerprint: 'x' }, { id: 'b', fingerprint: 'x' }]
    expect(pruneExpired(snoozes, items, NOW)).toEqual({ b: { until: NOW + 1000 } })
  })

  it('drops a fingerprint snooze once the underlying condition changed', () => {
    const snoozes = { a: { fingerprint: 'warning' } }
    const items = [{ id: 'a', fingerprint: 'critical' }]
    expect(pruneExpired(snoozes, items, NOW)).toEqual({})
  })

  it('keeps a fingerprint snooze for an item no longer present (nothing contradicts it yet)', () => {
    const snoozes = { a: { fingerprint: 'warning' } }
    expect(pruneExpired(snoozes, [], NOW)).toEqual({ a: { fingerprint: 'warning' } })
  })
})
