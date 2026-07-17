import { describe, expect, it } from 'vitest'
import { normalizeHAHlsPath, normalizeHAHlsStreamUrl, normalizeHAMediaPath } from './ha-paths.js'

describe('HA media path normalization', () => {
  it.each([
    '/local/photo.jpg',
    '/api/media_player_proxy/media_player.tv?token=a%2Bb',
    '/api/camera_proxy/camera.ingresso',
    '/api/image/serve/abc/original',
  ])('accepts a canonical media path: %s', (path) => {
    expect(normalizeHAMediaPath(path)).toBe(path)
  })

  it.each([
    '/api/config',
    '//attacker.invalid/file',
    '/local/../api/config',
    '/local/%2e%2e/api/config',
    '/local/%252e%252e/api/config',
    '/local/%252f..%252fapi/config',
    '/local/..\\api\\config',
  ])('rejects traversal or an arbitrary HA API path: %s', (path) => {
    expect(normalizeHAMediaPath(path)).toBeNull()
  })

  it('rejects traversal hidden behind five or more encoding layers', () => {
    const encoded = (layers: number) => {
      let value = '%2e%2e%2fapi%2fconfig'
      for (let index = 0; index < layers; index += 1) value = value.replaceAll('%', '%25')
      return `/local/${value}`
    }
    expect(normalizeHAMediaPath(encoded(5))).toBeNull()
    expect(normalizeHAMediaPath(encoded(20))).toBeNull()
  })
})

describe('HA HLS path normalization', () => {
  it('preserves a valid signed playlist path', () => {
    expect(normalizeHAHlsPath('signed_token/camera/playlist.m3u8')).toBe('signed_token/camera/playlist.m3u8')
  })

  it.each([
    '%25252e%25252e%25252fapi%25252fconfig',
    'token/%2525252e%2525252e%2525252fsecret.m3u8',
    'token/%2e%2e/secret.m3u8',
  ])('rejects recursively encoded HLS traversal: %s', (path) => {
    expect(normalizeHAHlsPath(path)).toBeNull()
  })

  it('normalizes relative and same-origin absolute stream URLs', () => {
    const base = 'https://homeassistant.local:8123'
    expect(normalizeHAHlsStreamUrl('/api/hls/token/master.m3u8?auth=a%2Bb', base))
      .toBe('/api/hls/token/master.m3u8?auth=a%2Bb')
    expect(normalizeHAHlsStreamUrl('https://homeassistant.local:8123/api/hls/token/master.m3u8', base))
      .toBe('/api/hls/token/master.m3u8')
  })

  it('rejects a stream URL from another origin', () => {
    expect(normalizeHAHlsStreamUrl('https://attacker.invalid/api/hls/token/master.m3u8', 'https://homeassistant.local:8123')).toBeNull()
  })
})
