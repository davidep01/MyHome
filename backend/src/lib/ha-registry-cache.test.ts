import { describe, expect, it } from 'vitest'
import { cacheHARegistry, getCachedHARegistry, invalidateHARegistryCache } from './ha-registry-cache.js'

describe('HA registry cache invalidation', () => {
  it('drops registry data when the HA connection changes', () => {
    const data = { areas: [{ id: 'old-home' }], devices: [], entities: [] }
    cacheHARegistry(data, 100)
    expect(getCachedHARegistry(1_000, 101)).toEqual(data)
    invalidateHARegistryCache()
    expect(getCachedHARegistry(1_000, 101)).toBeNull()
  })
})
