import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

const harness = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }))
vi.mock('react', () => ({ useEffect: (effect: () => (() => void) | undefined) => { harness.cleanup = effect() } }))
let request: ReturnType<typeof vi.fn>
let sentinel: EventTarget & { release: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.useFakeTimers()
  sentinel = Object.assign(new EventTarget(), { release: vi.fn(async () => {}) })
  request = vi.fn(async () => sentinel)
  vi.stubGlobal('navigator', { wakeLock: { request } })
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
})
afterEach(() => { harness.cleanup?.(); harness.cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers() })
describe('wake lock lifecycle', () => {
  it('releases a lock delivered after unmount', async () => {
    let resolve!: (value: typeof sentinel) => void
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    useWakeLock()
    harness.cleanup!()
    resolve(sentinel)
    await Promise.resolve()
    expect(sentinel.release).toHaveBeenCalledOnce()
  })
  it('reacquires an unexpected release while visible', async () => {
    useWakeLock()
    await Promise.resolve()
    sentinel.dispatchEvent(new Event('release'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('does not acquire twice while a request is in flight', async () => {
    request.mockImplementationOnce(() => new Promise(() => {}))
    useWakeLock()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(request).toHaveBeenCalledOnce()
  })
})
