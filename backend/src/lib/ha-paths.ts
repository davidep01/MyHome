const MEDIA_PREFIXES = [
  '/local/',
  '/api/media_player_proxy/',
  '/api/camera_proxy/',
  '/api/image/serve/',
] as const

function recursivelyDecodePath(value: string): string | null {
  let decoded = value
  let stable = false
  for (let pass = 0; pass < 16; pass += 1) {
    let next: string
    try { next = decodeURIComponent(decoded) } catch { return null }
    if (next === decoded) {
      stable = true
      break
    }
    decoded = next
  }
  // Excessive recursive encoding and residual encoded path separators/dots are
  // rejected instead of being left for Home Assistant to decode again.
  if (!stable || /%(?:25|2e|2f|5c)/i.test(decoded)) return null
  return decoded
}

/**
 * Canonicalizes the HA media path before a bearer-authenticated fetch. The
 * recursive decode is validation-only: it catches double-encoded dot/slash
 * segments without altering signed query values in the returned URL.
 */
export function normalizeHAMediaPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 2 || value.length > 2_048 || !value.startsWith('/') || value.startsWith('//')) return null
  const hasControl = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (value.includes('\\') || value.includes('#') || hasControl) return null

  let url: URL
  try {
    url = new URL(value, 'http://myhome-media.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'http://myhome-media.invalid') return null

  const decoded = recursivelyDecodePath(url.pathname)
  if (decoded === null) return null
  if (decoded.includes('\\') || decoded.includes('\0')) return null
  const segments = decoded.split('/')
  if (segments.some((segment) => segment === '.' || segment === '..')) return null

  const allowedCanonical = MEDIA_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  const allowedDecoded = MEDIA_PREFIXES.some((prefix) => decoded.startsWith(prefix))
  if (!allowedCanonical || !allowedDecoded) return null
  return `${url.pathname}${url.search}`
}

/**
 * Validates only the dynamic `/api/hls/*` path. The caller appends the original
 * query separately so signed HA parameters are never decoded or rewritten.
 */
export function normalizeHAHlsPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048 || value.startsWith('/')) return null
  const hasControl = [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (hasControl || value.includes('\\') || value.includes('?') || value.includes('#')) return null
  if (!/^[a-z0-9_~!$&'()+,;=:@%./-]+$/i.test(value)) return null

  const decoded = recursivelyDecodePath(value)
  if (decoded === null || decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return null
  if (decoded.split('/').some((segment) => segment === '.' || segment === '..') || decoded.includes('..')) return null
  return value
}
