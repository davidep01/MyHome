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
  startWebRtcSession,
} from './ha-webrtc.js'

let activeSession: string | null = null

afterEach(() => {
  if (activeSession) closeWebRtcSession(activeSession)
  activeSession = null
  wsMocks.handlers = null
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
})
