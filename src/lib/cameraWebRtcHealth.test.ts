import { describe, expect, it } from 'vitest'
import { CameraWebRtcHealth } from './cameraWebRtcHealth'

describe('camera WebRTC circuit breaker', () => {
  it('backs off after signaling fails and retries after the deadline', () => {
    const health = new CameraWebRtcHealth()
    health.recordFailure('camera.ring', 1_000, 5_000)

    expect(health.canAttempt('camera.ring', 5_999)).toBe(false)
    expect(health.canAttempt('camera.ring', 6_000)).toBe(true)
  })

  it('isolates cameras and clears a failure after a successful stream', () => {
    const health = new CameraWebRtcHealth()
    health.recordFailure('camera.ring', 1_000, 5_000)

    expect(health.canAttempt('camera.giardino', 2_000)).toBe(true)
    health.recordSuccess('camera.ring')
    expect(health.canAttempt('camera.ring', 2_000)).toBe(true)
  })
})

