import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/ha-config.js', () => ({
  getHAConfig: vi.fn(async () => ({
    haUrl: 'http://192.168.1.2:8123',
    haToken: 'test-token',
    valid: true,
  })),
  getHABaseUrl: vi.fn(async () => 'http://192.168.1.2:8123'),
}))

import { haRouter } from './ha.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('HLS proxy path hardening', () => {
  it('blocks deeply encoded traversal before contacting Home Assistant', async () => {
    const app = new Hono()
    app.route('/api/ha', haRouter)
    const response = await app.request(
      '/api/ha/hls/token/%2525252e%2525252e%2525252fapi%2525252fconfig?auth=signed-value',
    )
    expect(response.status).toBe(400)
  })

  it('forwards a valid signed query without decoding or rewriting it', async () => {
    const fetchMock = vi.fn(async () => new Response('#EXTM3U', {
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const app = new Hono()
    app.route('/api/ha', haRouter)

    const response = await app.request('/api/ha/hls/signed_token/playlist.m3u8?auth=a%2Bb%2Fc&expires=123')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.2:8123/api/hls/signed_token/playlist.m3u8?auth=a%2Bb%2Fc&expires=123',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
