import type { MiddlewareHandler } from 'hono'

export type ClientContext = 'desktop' | 'tablet' | 'unknown'

export function clientContextFromRequest(
  header: (name: string) => string | undefined,
  query?: (name: string) => string | undefined,
): ClientContext {
  const raw = header('X-MyHome-Client')?.toLowerCase()
  if (raw === 'desktop' || raw === 'tablet') return raw
  const client = query?.('client')?.toLowerCase()
  if (client === 'desktop' || client === 'tablet') return client
  return 'unknown'
}

export const desktopOnly: MiddlewareHandler = async (c, next) => {
  const context = clientContextFromRequest(
    (name) => c.req.header(name) ?? undefined,
    (name) => c.req.query(name) ?? undefined,
  )
  if (context !== 'desktop') {
    return c.json({ error: 'Pannello disponibile solo da desktop.' }, 403)
  }
  await next()
}
