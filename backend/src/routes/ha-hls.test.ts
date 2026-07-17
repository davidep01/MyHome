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
vi.mock('../lib/ha-ws.js', () => ({
  haWsCommand: vi.fn(),
}))

import { haRouter } from './ha.js'
import { haWsCommand } from '../lib/ha-ws.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('HLS proxy path hardening', () => {
  it('returns a fresh signed HA playlist for a camera', async () => {
    vi.mocked(haWsCommand).mockResolvedValueOnce({ url: '/api/hls/ring-token/master.m3u8?expires=123' })
    const app = new Hono()
    app.route('/api/ha', haRouter)

    const response = await app.request('/api/ha/camera-hls-url/camera.porta')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: '/api/hls/ring-token/master.m3u8?expires=123' })
    expect(haWsCommand).toHaveBeenCalledWith(
      { type: 'camera/stream', entity_id: 'camera.porta', format: 'hls' },
      15_000,
    )
  })

  it('accepts an absolute stream URL only when it belongs to the configured HA origin', async () => {
    vi.mocked(haWsCommand)
      .mockResolvedValueOnce({ url: 'http://192.168.1.2:8123/api/hls/ring-token/master.m3u8' })
      .mockResolvedValueOnce({ url: 'https://attacker.invalid/api/hls/stolen/master.m3u8' })
    const app = new Hono()
    app.route('/api/ha', haRouter)

    const accepted = await app.request('/api/ha/camera-hls-url/camera.porta')
    const rejected = await app.request('/api/ha/camera-hls-url/camera.porta')

    expect(await accepted.json()).toEqual({ url: '/api/hls/ring-token/master.m3u8' })
    expect(rejected.status).toBe(502)
  })

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
