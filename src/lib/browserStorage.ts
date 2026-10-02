type StorageKind = 'local' | 'session'
const fallback: Record<StorageKind, Map<string, string>> = { local: new Map(), session: new Map() }
function nativeStorage(kind: StorageKind): Storage | null {
  try { return typeof window === 'undefined' ? null : kind === 'local' ? window.localStorage : window.sessionStorage }
  catch { return null }
}
export function readStorage(key: string, kind: StorageKind = 'local'): string | null {
  try {
    const storage = nativeStorage(kind)
    if (storage) {
      const value = storage.getItem(key)
      if (value === null) fallback[kind].delete(key)
      else fallback[kind].set(key, value)
      return value
    }
  } catch { /* retain this session's value */ }
  return fallback[kind].get(key) ?? null
}
export function writeStorage(key: string, value: string, kind: StorageKind = 'local'): void {
  fallback[kind].set(key, value)
  try { nativeStorage(kind)?.setItem(key, value) } catch { /* session fallback */ }
}
export function removeStorage(key: string, kind: StorageKind = 'local'): void {
  fallback[kind].delete(key)
  try { nativeStorage(kind)?.removeItem(key) } catch { /* session fallback */ }
}
