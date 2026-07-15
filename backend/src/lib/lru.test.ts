import { describe, expect, it } from 'vitest'
import { ByteLru } from './lru.js'

const bytes = (n: number) => new Uint8Array(n)

describe('ByteLru', () => {
  it('memorizza e rilegge', () => {
    const lru = new ByteLru({ maxEntries: 4, maxTotalBytes: 100, ttlMs: 1_000 })
    lru.set('a', { bytes: bytes(10), contentType: 'image/jpeg' })
    expect(lru.get('a')?.contentType).toBe('image/jpeg')
    expect(lru.bytes).toBe(10)
  })

  it('sfratta la voce meno recente oltre maxEntries', () => {
    const lru = new ByteLru({ maxEntries: 2, maxTotalBytes: 1_000, ttlMs: 1_000 })
    lru.set('a', { bytes: bytes(1), contentType: 't' })
    lru.set('b', { bytes: bytes(1), contentType: 't' })
    lru.get('a') // a diventa la più recente
    lru.set('c', { bytes: bytes(1), contentType: 't' })
    expect(lru.get('b')).toBeNull()
    expect(lru.get('a')).not.toBeNull()
    expect(lru.get('c')).not.toBeNull()
  })

  it('rispetta il tetto di byte totali', () => {
    const lru = new ByteLru({ maxEntries: 10, maxTotalBytes: 30, ttlMs: 1_000 })
    lru.set('a', { bytes: bytes(20), contentType: 't' })
    lru.set('b', { bytes: bytes(20), contentType: 't' })
    expect(lru.get('a')).toBeNull()
    expect(lru.get('b')).not.toBeNull()
    expect(lru.bytes).toBeLessThanOrEqual(30)
  })

  it('ignora voci più grandi dell’intera cache', () => {
    const lru = new ByteLru({ maxEntries: 10, maxTotalBytes: 10, ttlMs: 1_000 })
    lru.set('a', { bytes: bytes(11), contentType: 't' })
    expect(lru.get('a')).toBeNull()
    expect(lru.size).toBe(0)
  })

  it('fa scadere le voci oltre il TTL', () => {
    let now = 0
    const lru = new ByteLru({ maxEntries: 10, maxTotalBytes: 100, ttlMs: 50, now: () => now })
    lru.set('a', { bytes: bytes(1), contentType: 't' })
    now = 49
    expect(lru.get('a')).not.toBeNull()
    now = 51
    expect(lru.get('a')).toBeNull()
  })
})
