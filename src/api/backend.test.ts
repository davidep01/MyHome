import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './backend'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { pathname: '/kiosk' } }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('backend request lifecycle', () => {
  it('aborts a silent server after the request deadline', async () => {
    let signal!: AbortSignal
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal
      signal.addEventListener('abort', () => reject(signal.reason))
    })))
    const result = request('/ha/states').catch((error: Error) => error)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(signal.aborted).toBe(true)
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('tempo') }))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the deadline active while decoding a stalled body', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    }) })))
    const result = request('/config').catch((error: Error) => error)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(await result).toBeInstanceOf(Error)
  })
  it('propagates caller cancellation and removes its deadline', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason))
    })))
    const controller = new AbortController()
    const result = request('/config', { signal: controller.signal }).catch((error) => error)
    controller.abort(new Error('cancelled'))
    expect(await result).toEqual(expect.objectContaining({ message: 'cancelled' }))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses the kiosk context and releases timers on success', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetch)
    expect(await request('/config')).toEqual({ ok: true })
    expect(fetch.mock.calls[0]).toEqual(['/api/config', expect.objectContaining({ headers: expect.objectContaining({ 'X-MyHome-Client': 'tablet' }) })])
    expect(vi.getTimerCount()).toBe(0)
  })
})
