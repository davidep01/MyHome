import { afterEach, describe, expect, it, vi } from 'vitest'

const configMocks = vi.hoisted(() => ({
  getHAConfig: vi.fn(async () => ({ haToken: 'secret' })),
  getHAWebSocketUrl: vi.fn(async () => 'ws://192.168.1.2:8123/api/websocket'),
}))

vi.mock('./ha-config.js', () => configMocks)

import { closeHaWs, getHaWsState, haWsCommand } from './ha-ws.js'

type WsEvent = { data?: unknown; reason?: string }

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readyState = 0
  readonly sent: string[] = []
  closeCalls = 0
  private readonly listeners = new Map<string, ((event: WsEvent) => void)[]>()

  constructor(url: string) {
    void url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closeCalls += 1
  }

  addEventListener(type: string, listener: (event: WsEvent) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emitMessage(message: Record<string, unknown>) {
    for (const listener of this.listeners.get('message') ?? []) listener({ data: JSON.stringify(message) })
  }
}

const originalWebSocket = globalThis.WebSocket

function installFakeWebSocket() {
  FakeWebSocket.instances = []
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: FakeWebSocket })
}

afterEach(() => {
  closeHaWs()
  vi.useRealTimers()
  vi.clearAllMocks()
  FakeWebSocket.instances = []
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, writable: true, value: originalWebSocket })
})

describe('HA WebSocket connection reliability', () => {
  it('opens one cold-start socket and closes it after all commands time out', async () => {
    installFakeWebSocket()

    await Promise.allSettled([
      haWsCommand({ type: 'config/area_registry/list' }, 10),
      haWsCommand({ type: 'config/device_registry/list' }, 10),
      haWsCommand({ type: 'config/entity_registry/list' }, 10),
    ])

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].closeCalls).toBe(1)
    expect(configMocks.getHAConfig).toHaveBeenCalledOnce()
    expect(getHaWsState()).toBe('idle')
  })

  it('closes and rejects a socket that never completes authentication', async () => {
    vi.useFakeTimers()
    installFakeWebSocket()
    const command = haWsCommand({ type: 'config/area_registry/list' }, 30_000)
    const rejected = expect(command).rejects.toThrow('authentication timed out')
    await vi.advanceTimersByTimeAsync(0)

    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    await rejected
    expect(FakeWebSocket.instances[0].closeCalls).toBe(1)
    expect(getHaWsState()).toBe('idle')
  })

  it('removes a timed-out frame before flushing the pre-auth queue', async () => {
    vi.useFakeTimers()
    installFakeWebSocket()
    const expired = haWsCommand({ type: 'expired-command' }, 10)
    const live = haWsCommand<string>({ type: 'live-command' }, 1_000)
    const expiredResult = expect(expired).rejects.toThrow('command timed out')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10)
    await expiredResult

    const ws = FakeWebSocket.instances[0]
    ws.emitMessage({ type: 'auth_ok' })
    const commandFrames = ws.sent.map((frame) => JSON.parse(frame) as { id?: number; type?: string })
      .filter((frame) => frame.type?.endsWith('command'))
    expect(commandFrames).toHaveLength(1)
    expect(commandFrames[0].type).toBe('live-command')

    ws.emitMessage({ type: 'result', id: commandFrames[0].id, success: true, result: 'ok' })
    await expect(live).resolves.toBe('ok')
    expect(ws.closeCalls).toBe(1)
    expect(getHaWsState()).toBe('idle')
  })

  it('bounds commands queued while HA never authenticates', async () => {
    vi.useFakeTimers()
    installFakeWebSocket()
    const commands = Array.from({ length: 300 }, (_, index) =>
      haWsCommand({ type: `queued-${index}` }, 1_000))
    const settlements = Promise.allSettled(commands)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1_000)

    const results = await settlements
    const messages = results.map((result) => result.status === 'rejected' ? String(result.reason) : '')
    expect(messages.filter((message) => message.includes('pre-auth queue is full'))).toHaveLength(44)
    expect(messages.filter((message) => message.includes('command timed out'))).toHaveLength(256)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(FakeWebSocket.instances[0].closeCalls).toBe(1)
    expect(getHaWsState()).toBe('idle')
  })
})
