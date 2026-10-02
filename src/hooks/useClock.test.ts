import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const harness = vi.hoisted(() => ({ state: null as null | { now: Date }, cleanup: undefined as undefined | (() => void) }))
vi.mock('react', () => ({
  useState: (initial: () => { now: Date }) => {
    harness.state = initial()
    return [harness.state, (next: { now: Date } | ((current: { now: Date }) => { now: Date })) => { harness.state = typeof next === 'function' ? next(harness.state!) : next }]
  },
  useEffect: (effect: () => () => void) => { harness.cleanup = effect() },
}))
import { useClock } from './useClock'
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T10:00:00Z')); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' })) })
afterEach(() => { harness.cleanup?.(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('local widget clock', () => {
  it('updates on the minute without network requests and catches up on visibility', async () => {
    useClock()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.state?.now.toISOString()).toBe('2026-10-02T10:01:00.000Z')
    vi.setSystemTime(new Date('2026-10-03T10:01:00Z'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(harness.state?.now.toISOString()).toBe('2026-10-03T10:01:00.000Z')
  })
})
