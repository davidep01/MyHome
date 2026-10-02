import { afterEach, describe, expect, it, vi } from 'vitest'

const wsMocks = vi.hoisted(() => ({
  haWsCommand: vi.fn(async () => null),
  haWsSubscribe: vi.fn(),
  handlers: null as null | { onEvent: (event: unknown) => void; onError?: (error: Error) => void },
  unsubscribe: vi.fn(),
}))

vi.mock('./ha-ws.js', () => ({
  haWsCommand: wsMocks.haWsCommand,
  haWsSubscribe: wsMocks.haWsSubscribe.mockImplementation(async (_message, handlers) => {
    wsMocks.handlers = handlers
    return wsMocks.unsubscribe
  }),
}))

import {
  addWebRtcCandidate,
  closeWebRtcSession,
  listenWebRtcSession,
  hasWebRtcSession,
  startWebRtcSession,
} from './ha-webrtc.js'

let activeSession: string | null = null

afterEach(() => {
  if (activeSession) closeWebRtcSession(activeSession)
  activeSession = null
  wsMocks.handlers = null
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('HA WebRTC session bridge', () => {
  it('buffers signaling events until the browser event stream connects', async () => {
    activeSession = await startWebRtcSession('camera.entrata_live_view', 'v=0\r\n')
    wsMocks.handlers?.onEvent({ type: 'answer', answer: 'answer-sdp' })

    const listener = vi.fn()
    const unlisten = listenWebRtcSession(activeSession, listener)

    expect(listener).toHaveBeenCalledWith({ type: 'answer', answer: 'answer-sdp' })
    expect(unlisten).toBeTypeOf('function')
  })

  it('queues local ICE until HA publishes its signaling session id', async () => {
    activeSession = await startWebRtcSession('camera.entrata_live_view', 'v=0\r\n')
    await addWebRtcCandidate(activeSession, { candidate: 'candidate:1', sdpMid: '0' })
    expect(wsMocks.haWsCommand).not.toHaveBeenCalled()

    wsMocks.handlers?.onEvent({ type: 'session', session_id: 'ha-session' })
    await vi.waitFor(() => expect(wsMocks.haWsCommand).toHaveBeenCalledWith({
      type: 'camera/webrtc/candidate',
      entity_id: 'camera.entrata_live_view',
      session_id: 'ha-session',
      candidate: { candidate: 'candidate:1', sdpMid: '0' },
    }))
  })
  it('keeps a viewed camera alive and expires only after the last viewer leaves', async () => {
    vi.useFakeTimers()
    activeSession = await startWebRtcSession('camera.entrata', 'offer')
    const leave = listenWebRtcSession(activeSession, vi.fn())!
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(hasWebRtcSession(activeSession)).toBe(true)
    leave()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(hasWebRtcSession(activeSession)).toBe(false)
    expect(wsMocks.unsubscribe).toHaveBeenCalledOnce()
  })

  it('reports a failed buffered ICE command to the browser', async () => {
    activeSession = await startWebRtcSession('camera.entrata', 'offer')
    await addWebRtcCandidate(activeSession, { candidate: 'candidate:1' })
    const listener = vi.fn()
    listenWebRtcSession(activeSession, listener)
    wsMocks.haWsCommand.mockRejectedValueOnce(new Error('HA offline'))
    wsMocks.handlers?.onEvent({ type: 'session', session_id: 'ha-session' })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ type: 'error', code: 'ice_candidate', message: 'HA offline' }))
  })

  it('wakes connected signaling listeners when the session is explicitly closed', async () => {
    activeSession = await startWebRtcSession('camera.entrata', 'offer')
    const listener = vi.fn()
    listenWebRtcSession(activeSession, listener)
    closeWebRtcSession(activeSession)
    expect(listener).toHaveBeenCalledWith({ type: 'error', code: 'session_closed', message: 'Sessione video chiusa' })
    expect(hasWebRtcSession(activeSession)).toBe(false)
  })

  it('refuses capacity overflow without evicting a viewed camera', async () => {
    const ids: string[] = []
    try {
      for (let i = 0; i < 12; i++) {
        const id = await startWebRtcSession('camera.entrata', 'offer')
        ids.push(id)
        listenWebRtcSession(id, vi.fn())
      }
      await expect(startWebRtcSession('camera.entrata', 'offer')).rejects.toThrow('in uso')
      expect(ids.every(hasWebRtcSession)).toBe(true)
    } finally { ids.forEach(closeWebRtcSession) }
  })

})
