import { describe, expect, it } from 'vitest'
import { cameraTransportPolicy } from './cameraTransport'

describe('native camera transport policy', () => {
  it('allows a slow Ring answer without falling back to a recording', () => {
    const policy = cameraTransportPolicy(['web_rtc'])
    expect(policy.negotiationMs).toBeGreaterThan(30_000)
    expect(policy.hls).toBe(false)
    expect(policy.mjpeg).toBe(false)
    expect(policy.failureBackoffMs).toBeLessThan(12_000)
  })
  it('uses only advertised HLS but preserves legacy MJPEG cameras', () => {
    expect(cameraTransportPolicy(['hls'])).toMatchObject({ webRtc: false, hls: true, mjpeg: true })
    expect(cameraTransportPolicy([])).toMatchObject({ webRtc: false, hls: false, mjpeg: true })
    expect(cameraTransportPolicy()).toMatchObject({ webRtc: true, hls: true, mjpeg: true })
  })
})
