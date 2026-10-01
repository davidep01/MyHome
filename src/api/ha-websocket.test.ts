import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectHAStream, disconnectHAStream } from './ha-websocket'
import { haApi, alarmApi } from './backend'
import { useEntityStore } from '../store/entities'

class TestEventSource {
  static current: TestEventSource
  listeners = new Map<string, (event: { data: string }) => void>()
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor() { TestEventSource.current = this }
  addEventListener(name: string, listener: (event: { data: string }) => void) { this.listeners.set(name, listener) }
  emit(name: string, data: unknown = 'ok') { this.listeners.get(name)?.({ data: JSON.stringify(data) }) }
}

afterEach(() => {
  disconnectHAStream()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('browser HA stream recovery', () => {
  it('clears reconnecting after a quiet resume and preserves a reported outage', async () => {
    vi.stubGlobal('EventSource', TestEventSource)
    await connectHAStream()
    const source = TestEventSource.current
    source.emit('ready')
    source.emit('states', { type: 'snapshot', entities: [] })
    expect(useEntityStore.getState().connectionStatus).toBe('connected')
    source.onerror?.()
    expect(useEntityStore.getState().connectionStatus).toBe('connecting')
    source.emit('ready')
    source.emit('states', { type: 'status', connected: true })
    expect(useEntityStore.getState().connectionStatus).toBe('connected')
    source.emit('states', { type: 'status', connected: false, message: 'HA offline' })
    expect(useEntityStore.getState()).toMatchObject({ connectionStatus: 'error', lastError: 'HA offline' })
    source.emit('states', { type: 'status', connected: true })
    expect(useEntityStore.getState()).toMatchObject({ connectionStatus: 'connected', lastError: undefined })
  })
})


describe('bounded SSE fallback and recovery', () => {
  it('does not consider ready a state snapshot and reprobes after falling back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', TestEventSource)
    vi.spyOn(haApi, 'states').mockResolvedValue([])
    vi.spyOn(alarmApi, 'testStatus').mockResolvedValue({ active: false, serverNow: new Date().toISOString() })
    await connectHAStream()
    const first = TestEventSource.current
    first.emit('ready')
    await vi.advanceTimersByTimeAsync(6000)
    expect(first.close).toHaveBeenCalledOnce()
    expect(haApi.states).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(15000)
    const recovered = TestEventSource.current
    expect(recovered).not.toBe(first)
    recovered.emit('states', { type: 'snapshot', entities: [] })
    const calls = vi.mocked(haApi.states).mock.calls.length
    recovered.emit('ping')
    await vi.advanceTimersByTimeAsync(4000)
    expect(haApi.states).toHaveBeenCalledTimes(calls)
    expect(useEntityStore.getState().connectionStatus).toBe('connected')
  })

  it('bounds silent transport after a successful snapshot and cancels timers on disconnect', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('EventSource', TestEventSource)
    vi.spyOn(haApi, 'states').mockResolvedValue([])
    vi.spyOn(alarmApi, 'testStatus').mockResolvedValue({ active: false, serverNow: new Date().toISOString() })
    await connectHAStream()
    const source = TestEventSource.current
    source.emit('states', { type: 'snapshot', entities: [] })
    await vi.advanceTimersByTimeAsync(35000)
    expect(source.close).toHaveBeenCalledOnce()
    disconnectHAStream()
    const calls = vi.mocked(haApi.states).mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(haApi.states).toHaveBeenCalledTimes(calls)
    expect(useEntityStore.getState().connectionStatus).toBe('disconnected')
  })
})
