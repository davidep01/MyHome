import { isIP } from 'node:net'
import type { MiddlewareHandler } from 'hono'
import { isLanHostname } from './ha-config.js'

function normalizedHostname(value: string): string | null {
  if (!value || value.length > 255) return null
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 || code === 127) return null
  }
  try {
    const url = new URL(`http://${value}`)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  } catch {
    return null
  }
}

function explicitlyAllowedHosts(): ReadonlySet<string> {
  const values = (process.env.MYHOME_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) => normalizedHostname(entry.trim()))
    .filter((entry): entry is string => Boolean(entry))
  return new Set(values)
}

/**
 * Protects every response, including static files and login, from DNS-rebinding
 * requests. LAN IPs/names work without setup; public/custom names require an
 * exact MYHOME_ALLOWED_HOSTS entry.
 */
export function isAllowedRequestHost(hostHeader: string): boolean {
  const hostname = normalizedHostname(hostHeader)
  if (!hostname) return false
  if (explicitlyAllowedHosts().has(hostname)) return true
  if (isLanHostname(hostname)) return true
  // `.lan` is widely used by private DNS resolvers and is accepted by the
  // kiosk-side Fully guard. It is safe for inbound Host validation; unlike an
  // HA destination, no bearer token is ever sent to it.
  if (hostname.endsWith('.lan') && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)) return true

  // Single-label names are common for LAN DNS and container ingress. Unlike an
  // HA destination they never receive a bearer token, while dotted public
  // names remain denied unless explicitly allowlisted.
  return isIP(hostname) === 0 && !hostname.includes('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(hostname)
}

export const enforceAllowedHost: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('host') ?? new URL(c.req.url).host
  if (!isAllowedRequestHost(host)) {
    return c.json({ error: 'Host non consentito' }, 403)
  }
  await next()
}
