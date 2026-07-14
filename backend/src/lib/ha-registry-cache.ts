export interface RegistryPayload {
  areas: unknown[]
  devices: unknown[]
  entities: unknown[]
}

let registryCache: { at: number; data: RegistryPayload } | null = null

export function getCachedHARegistry(ttlMs: number, now = Date.now()): RegistryPayload | null {
  return registryCache && now - registryCache.at < ttlMs ? registryCache.data : null
}

export function cacheHARegistry(data: RegistryPayload, now = Date.now()): void {
  registryCache = { at: now, data }
}

export function invalidateHARegistryCache(): void {
  registryCache = null
}
