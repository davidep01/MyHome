import { describe, expect, it } from 'vitest'
import { safeRequestLogPath } from './request-logger.js'

describe('safe request logging', () => {
  it('never records query strings containing signed media parameters', () => {
    const value = safeRequestLogPath('http://myhome.local/api/ha/media?path=%2Fapi%2Fmedia_player_proxy%2Fx%3Ftoken%3Dsecret')
    expect(value).toBe('/api/ha/media')
    expect(value).not.toContain('secret')
  })

  it('redacts the complete dynamic HLS tail', () => {
    const value = safeRequestLogPath('http://myhome.local/api/ha/hls/signed-secret/playlist.m3u8?auth=also-secret')
    expect(value).toBe('/api/ha/hls/[redacted]')
    expect(value).not.toContain('secret')
    expect(safeRequestLogPath('http://myhome.local/api/ha/hls%2Fsigned-secret')).toBe('/api/ha/hls/[redacted]')
  })
})
