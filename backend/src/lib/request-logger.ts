import type { MiddlewareHandler } from 'hono'

/**
 * Returns the only request identifier that is safe to persist in logs.
 *
 * Query strings are deliberately never logged: HA media URLs commonly carry
 * signed bearer-like parameters. HLS paths can carry the signature in a path
 * segment, so the complete dynamic tail is hidden as well.
 */
export function safeRequestLogPath(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl).pathname
    const lowerPath = pathname.toLowerCase()
    if (lowerPath === '/api/ha/hls' || lowerPath.startsWith('/api/ha/hls/') || lowerPath.startsWith('/api/ha/hls%')) {
      return '/api/ha/hls/[redacted]'
    }
    return pathname
  } catch {
    return '[invalid-url]'
  }
}

function elapsed(startedAt: number): string {
  const duration = Date.now() - startedAt
  return duration < 1_000 ? `${duration}ms` : `${Math.round(duration / 1_000)}s`
}

/** Endpoint di sincronizzazione frequente: i 2xx sono attesi e non utili nel log. */
export function isQuietRequest(method: string, path: string): boolean {
  return method === 'GET' && path === '/api/alarm/test'
}

/** Minimal request logger that cannot persist signed URLs or query secrets. */
export const safeRequestLogger: MiddlewareHandler = async (c, next) => {
  const method = c.req.method
  const path = safeRequestLogPath(c.req.url)
  const quiet = isQuietRequest(method, path)
  if (!quiet) console.log(`<-- ${method} ${path}`)
  const startedAt = Date.now()
  await next()
  // Gli errori restano sempre visibili, anche per gli endpoint ad alta frequenza.
  if (!quiet || c.res.status >= 400) console.log(`--> ${method} ${path} ${c.res.status} ${elapsed(startedAt)}`)
}
