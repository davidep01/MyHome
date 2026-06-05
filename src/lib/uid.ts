/**
 * Stable unique id that also works in non-secure contexts. The kiosk is served
 * over plain HTTP on the LAN, where `crypto.randomUUID()` is undefined (it
 * requires a secure context), so we fall back to a timestamp + random suffix.
 */
export function uid(prefix = 'id'): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID() } catch { /* not allowed in this context */ }
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
