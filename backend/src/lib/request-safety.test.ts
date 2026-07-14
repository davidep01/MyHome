import { describe, expect, it } from 'vitest'
import {
  BoundedTtlCache,
  FixedWindowRateLimiter,
  assertPublicHttpsUrl,
  isPrivateOrReservedAddress,
  readJsonBody,
} from './request-safety.js'

describe('request safety', () => {
  it('parses a bounded application/json body', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: true }),
    })
    await expect(readJsonBody(request, 1_024)).resolves.toEqual({ ok: true, value: { ok: true } })
  })

  it('rejects unsupported content and oversized declared bodies', async () => {
    const text = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    })
    expect(await readJsonBody(text, 100)).toMatchObject({ ok: false, status: 415 })

    const oversized = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '101' },
      body: '{}',
    })
    expect(await readJsonBody(oversized, 100)).toMatchObject({ ok: false, status: 413 })
  })

  it.each([
    '127.0.0.1',
    '10.0.0.2',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.20',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    '0:0:0:0:0:ffff:7f00:1',
    'fd00::1',
    'fe80::1',
  ])('recognizes private or reserved address %s', (address) => {
    expect(isPrivateOrReservedAddress(address)).toBe(true)
  })

  it('allows ordinary public IP addresses', () => {
    expect(isPrivateOrReservedAddress('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedAddress('2606:4700:4700::1111')).toBe(false)
  })

  it('rejects local RSS destinations before any fetch', async () => {
    await expect(assertPublicHttpsUrl('https://127.0.0.1/feed.xml')).rejects.toMatchObject({
      reason: 'unsafe_url',
    })
    await expect(assertPublicHttpsUrl('http://example.com/feed.xml')).rejects.toMatchObject({
      reason: 'unsafe_url',
    })
  })

  it('bounds and expires cache entries', () => {
    const cache = new BoundedTtlCache<number>(2)
    cache.set('a', 1, 100, 0)
    cache.set('b', 2, 100, 0)
    cache.set('c', 3, 100, 0)
    expect(cache.size).toBe(2)
    expect(cache.get('a', 1)).toBeUndefined()
    expect(cache.get('b', 101)).toBeUndefined()
    expect(cache.get('c', 50)).toBe(3)
  })

  it('enforces a fixed window and reports when it resets', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000)
    expect(limiter.consume('client', 0).allowed).toBe(true)
    expect(limiter.consume('client', 10).allowed).toBe(true)
    expect(limiter.consume('client', 20)).toEqual({ allowed: false, retryAfterSeconds: 1 })
    expect(limiter.consume('client', 1_000).allowed).toBe(true)
  })
})
