import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ha-ws.js', () => ({
  closeHaWs: vi.fn(),
  getHaWsState: vi.fn(() => 'idle'),
  startEntityFeed: vi.fn(),
  stopEntityFeed: vi.fn(),
}))
vi.mock('./ha-config.js', () => ({
  getHAConfig: vi.fn(async () => ({ haToken: 'secret' })),
  getHABaseUrl: vi.fn(async () => 'http://192.168.1.2:8123'),
}))

import { fetchHAStatesWithTimeout, getStreamStats, invalidateHAConnection, isKnownHAImageSource, recentDoorbellActivityKey, subscribeHaStream } from './ha-stream.js'
import { startEntityFeed } from './ha-ws.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe.sequential('HA poll fallback', () => {
  it('aborts a stalled states request at its deadline', async () => {
    const stalledFetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return reject(new Error('missing abort signal'))
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })) as unknown as typeof fetch

    await expect(fetchHAStatesWithTimeout('http://192.168.1.2:8123', 'secret', 10, stalledFetch)).rejects.toBeDefined()
    expect(stalledFetch).toHaveBeenCalledOnce()
  })

  it('accepts a bounded successful snapshot', async () => {
    const fetchImpl = vi.fn(async () => Response.json([{ entity_id: 'light.kitchen', state: 'on' }])) as unknown as typeof fetch
    await expect(fetchHAStatesWithTimeout('http://192.168.1.2:8123/', 'secret', 100, fetchImpl)).resolves.toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.2:8123/api/states', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('clears old state while retaining active SSE subscribers on invalidation', () => {
    const events: unknown[] = []
    const unsubscribe = subscribeHaStream((event) => events.push(event))
    expect(getStreamStats().subscribers).toBe(1)
    const handlers = vi.mocked(startEntityFeed).mock.calls.at(-1)?.[0]
    handlers?.onSnapshot([{
      entity_id: 'media_player.living_room',
      state: 'playing',
      attributes: { entity_picture: 'https://media.example/known.jpg' },
    }])
    expect(isKnownHAImageSource('https://media.example/known.jpg')).toBe(true)
    expect(isKnownHAImageSource('https://attacker.example/arbitrary.jpg')).toBe(false)

    invalidateHAConnection()

    expect(getStreamStats()).toMatchObject({ subscribers: 1, entities: 0 })
    expect(events.at(-1)).toEqual({ type: 'snapshot', entities: [] })
    expect(isKnownHAImageSource('https://media.example/known.jpg')).toBe(false)
    unsubscribe()
    expect(getStreamStats().subscribers).toBe(0)
  })

  it('does not let a late poll overwrite a newer WebSocket snapshot', async () => {
    let resolvePoll: ((response: Response) => void) | undefined
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolvePoll = resolve })) as unknown as typeof fetch
    const unsubscribe = subscribeHaStream(() => undefined)
    const handlers = vi.mocked(startEntityFeed).mock.calls.at(-1)?.[0]
    handlers?.onDown('test fallback')
    await vi.waitFor(() => expect(resolvePoll).toBeTypeOf('function'))

    handlers?.onSnapshot([{
      entity_id: 'media_player.new_home',
      state: 'playing',
      attributes: { entity_picture: 'https://media.example/new.jpg' },
    }])
    resolvePoll?.(Response.json([{
      entity_id: 'media_player.old_home',
      state: 'playing',
      attributes: { entity_picture: 'https://media.example/old.jpg' },
    }]))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getStreamStats()).toMatchObject({ mode: 'ws', entities: 1 })
    expect(isKnownHAImageSource('https://media.example/new.jpg')).toBe(true)
    expect(isKnownHAImageSource('https://media.example/old.jpg')).toBe(false)
    unsubscribe()
  })

  it('authorizes Vision only after a recent server-observed real trigger', () => {
    const unsubscribe = subscribeHaStream(() => undefined)
    const handlers = vi.mocked(startEntityFeed).mock.calls.at(-1)?.[0]
    handlers?.onSnapshot([
      { entity_id: 'event.front_door', state: '2026-07-14T21:00:00Z', last_changed: new Date().toISOString(), context: { id: 'ring-1' } },
      { entity_id: 'binary_sensor.side_door', state: 'off', last_changed: new Date().toISOString() },
    ])

    expect(recentDoorbellActivityKey('event.front_door')).toBe('event.front_door:ring-1')
    expect(recentDoorbellActivityKey('binary_sensor.side_door')).toBeNull()
    expect(recentDoorbellActivityKey('event.unknown')).toBeNull()
    unsubscribe()
  })
})
