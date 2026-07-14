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

/** Minimal request logger that cannot persist signed URLs or query secrets. */
export const safeRequestLogger: MiddlewareHandler = async (c, next) => {
  const method = c.req.method
  const path = safeRequestLogPath(c.req.url)
  console.log(`<-- ${method} ${path}`)
  const startedAt = Date.now()
  await next()
  console.log(`--> ${method} ${path} ${c.res.status} ${elapsed(startedAt)}`)
}
