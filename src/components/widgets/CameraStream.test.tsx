import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CameraStream } from './CameraStream'
import { cameraWebRtcHealth } from '../../lib/cameraWebRtcHealth'

const harness = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, values: [] as unknown[], refIndex: 0, stateIndex: 0, video: null as unknown, screenOn: true, screensaver: false }))
const api = vi.hoisted(() => ({ cameraCapabilities: vi.fn(), cameraWebRtcConfig: vi.fn(), cameraWebRtcOffer: vi.fn(), cameraWebRtcClose: vi.fn(), cameraWebRtcCandidate: vi.fn(), cameraWebRtcEventsUrl: vi.fn(() => '/events'), cameraHlsUrl: vi.fn() }))
vi.mock('react', () => ({
  useEffect: (effect: () => unknown) => harness.effects.push(effect),
  useRef: (initial: unknown) => ({ current: harness.refIndex++ === 0 ? harness.video : initial }),
  useState: (initial: unknown) => { const index = harness.stateIndex++; harness.values[index] = initial; return [initial, (next: unknown) => { harness.values[index] = typeof next === 'function' ? next(harness.values[index]) : next }] },
}))
vi.mock('../../hooks/useHAEntity', () => ({ useHAEntity: (id: string) => id.endsWith('_snapshot') ? undefined : { entity_id: id, state: 'idle', attributes: {} } }))
vi.mock('../../hooks/useActiveWhenVisible', () => ({ useActiveWhenVisible: () => ({ ref: {}, active: true }) }))
vi.mock('../../store/ui', () => ({ useUIStore: () => null }))
vi.mock('../../store/fullyKiosk', () => ({ useFullyKioskStore: (select: (state: unknown) => unknown) => select({ screenOn: harness.screenOn, screensaverActive: harness.screensaver }) }))
vi.mock('../../api/backend', () => ({ haApi: api }))
vi.mock('./utils/mapEntityToWidgetCard', () => ({ entityName: () => 'Ring' }))

class FakeVideo extends EventTarget {
  currentTime = 0
  readyState = 0
  paused = true
  srcObject: unknown = null
  play = vi.fn(async () => { this.paused = false })
  pause = vi.fn(() => { this.paused = true })
  load = vi.fn()
  removeAttribute = vi.fn()
}
class FakePeer {
  static instances: FakePeer[] = []
  connectionState = 'new'
  ontrack: ((event: { track: { kind: string } }) => void) | null = null
  onicecandidate: ((event: unknown) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  close = vi.fn()
  createDataChannel = vi.fn()
  addTransceiver = vi.fn()
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer' }))
  setLocalDescription = vi.fn(async () => {})
  setRemoteDescription = vi.fn(async () => {})
  addIceCandidate = vi.fn(async () => {})
  constructor() { FakePeer.instances.push(this) }
}
class FakeSignals extends EventTarget { close = vi.fn(); onerror = null }
const cleanups: Array<() => void> = []
function mount() {
  CameraStream({ entityId: 'camera.entrata_live_view', preferLive: true })
  for (const effect of harness.effects.splice(0)) { const cleanup = effect(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void) }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); cameraWebRtcHealth.reset()
  harness.refIndex = 0; harness.stateIndex = 0; harness.values = []; harness.screenOn = true; harness.screensaver = false; harness.video = new FakeVideo()
  FakePeer.instances = []
  api.cameraCapabilities.mockResolvedValue({ frontend_stream_types: ['web_rtc'] })
  api.cameraWebRtcConfig.mockResolvedValue({ configuration: {} })
  api.cameraWebRtcOffer.mockResolvedValue({ sessionId: 'session' })
  api.cameraWebRtcClose.mockResolvedValue({ ok: true })
  api.cameraWebRtcCandidate.mockResolvedValue({ ok: true })
  vi.stubGlobal('RTCPeerConnection', FakePeer)
  vi.stubGlobal('MediaStream', class { addTrack() {} getTracks() { return [] } })
  vi.stubGlobal('EventSource', FakeSignals)
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.unstubAllGlobals(); vi.useRealTimers()
})

describe('Ring player lifecycle', () => {
  it('keeps negotiating after four seconds, confirms a real first frame and closes on exit', async () => {
    mount(); await vi.advanceTimersByTimeAsync(5_000)
    expect(api.cameraWebRtcOffer).toHaveBeenCalledOnce()
    expect(api.cameraHlsUrl).not.toHaveBeenCalled()
    expect(harness.values[0]).toBe('connecting')
    const video = harness.video as FakeVideo
    video.readyState = 4; video.paused = false; video.dispatchEvent(new Event('playing'))
    expect(harness.values[0]).toBe('webrtc')
    cleanups.splice(0).forEach((cleanup) => cleanup())
    expect(FakePeer.instances[0].close).toHaveBeenCalledOnce()
    expect(api.cameraWebRtcClose).toHaveBeenCalledWith('session')
  })
  it('never labels the last recording as live when a native Ring session times out', async () => {
    mount(); await vi.advanceTimersByTimeAsync(45_001)
    expect(harness.values[0]).toBe('error')
    expect(api.cameraHlsUrl).not.toHaveBeenCalled()
    expect(api.cameraWebRtcClose).toHaveBeenCalledWith('session')
  })
  it('closes an offer arriving after the panel was dismissed', async () => {
    let resolveOffer!: (value: { sessionId: string }) => void
    api.cameraWebRtcOffer.mockImplementation(() => new Promise((resolve) => { resolveOffer = resolve }))
    mount(); await vi.advanceTimersByTimeAsync(0)
    cleanups.splice(0).forEach((cleanup) => cleanup())
    resolveOffer({ sessionId: 'late-session' }); await vi.advanceTimersByTimeAsync(0)
    expect(api.cameraWebRtcClose).toHaveBeenCalledWith('late-session')
  })
  it('does not open a cloud session while Fully reports a powered-off screen', async () => {
    harness.screenOn = false; mount(); await vi.advanceTimersByTimeAsync(60_000)
    expect(api.cameraCapabilities).not.toHaveBeenCalled()
    expect(harness.values[0]).toBe('paused')
  })
  it('offers a gesture to resume when autoplay is blocked instead of abandoning Ring', async () => {
    const video = harness.video as FakeVideo
    video.play.mockRejectedValueOnce(Object.assign(new Error('Autoplay blocked'), { name: 'NotAllowedError' }))
    mount(); await vi.advanceTimersByTimeAsync(0)
    FakePeer.instances[0].ontrack?.({ track: { kind: 'video' } })
    await vi.advanceTimersByTimeAsync(50_000)
    expect(harness.values[4]).toBe(true)
    expect(harness.values[0]).toBe('connecting')
    expect(api.cameraWebRtcClose).not.toHaveBeenCalled()
  })
  it('recovers a signaling failure after playback instead of leaving a false LIVE badge', async () => {
    mount(); await vi.advanceTimersByTimeAsync(0)
    const video = harness.video as FakeVideo
    video.readyState = 4; video.paused = false; video.dispatchEvent(new Event('playing'))
    api.cameraWebRtcCandidate.mockRejectedValueOnce(new Error('ICE rejected'))
    FakePeer.instances[0].onicecandidate?.({ candidate: { candidate: 'ice', toJSON: () => ({ candidate: 'ice', sdpMLineIndex: 0 }) } })
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.values[0]).toBe('connecting')
    expect(harness.values[5]).toBe(1)
    expect(cameraWebRtcHealth.canAttempt('camera.entrata_live_view')).toBe(false)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(cameraWebRtcHealth.canAttempt('camera.entrata_live_view')).toBe(true)
  })
  it('repeated waiting events cannot keep a frozen stream alive indefinitely', async () => {
    mount(); await vi.advanceTimersByTimeAsync(0)
    const video = harness.video as FakeVideo
    video.readyState = 4; video.paused = false; video.dispatchEvent(new Event('playing'))
    await vi.advanceTimersByTimeAsync(8_000); video.dispatchEvent(new Event('waiting'))
    await vi.advanceTimersByTimeAsync(2_001)
    expect(harness.values[5]).toBe(1)
  })
})
