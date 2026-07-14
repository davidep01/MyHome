import { isIP } from 'node:net'
import { db } from '../db/client.js'

const DEFAULT_HA_URL = 'http://homeassistant.local:8123'

function envValue(key: string): string {
  const value = process.env[key]?.trim() ?? ''
  if (!value || value.startsWith('your_') || value === '***') return ''
  return value
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = octets
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
}

function ipv6Hextets(address: string): number[] | null {
  let normalized = address.toLowerCase().split('%', 1)[0]
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (dotted) {
    const octets = dotted[1].split('.').map(Number)
    if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
    normalized = `${normalized.slice(0, -dotted[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null
  const parts = [...left, ...Array<number>(missing).fill(0), ...right]
  if (parts.length !== 8 || parts.some((part) => typeof part === 'string' && !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => typeof part === 'number' ? part : Number.parseInt(part, 16))
}

function isPrivateIpv6(hostname: string): boolean {
  const parts = ipv6Hextets(hostname)
  if (!parts) return false
  const loopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1
  if (loopback) return true
  const first = parts[0]
  if ((first & 0xfe00) === 0xfc00) return true // ULA fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true // link-local fe80::/10

  const mappedV4 = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (mappedV4) {
    return isPrivateIpv4(`${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`)
  }
  return false
}

export function isLanHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const family = isIP(hostname)
  if (family === 4) return isPrivateIpv4(hostname)
  if (family === 6) return isPrivateIpv6(hostname)
  if (hostname === 'localhost') return true

  // LAN names must use a reserved local namespace. Arbitrary single-label
  // names are rejected because search-domain expansion can resolve them to a
  // public host and would send that host the long-lived HA bearer token.
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)) return false
  return hostname.endsWith('.local') || hostname.endsWith('.home.arpa')
}

/** Normalizes an HA base URL and rejects destinations outside the local network. */
export function normalizeHAUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_048) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    if (url.search || url.hash) return null
    url.hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    url.pathname = url.pathname.replace(/\/+$/, '')

    // Home Assistant Supervisor exposes Core through this exact internal
    // proxy. Keep the exception deliberately narrow: arbitrary single-label
    // destinations must never receive a long-lived HA bearer token.
    if (url.hostname === 'supervisor') {
      if (url.protocol !== 'http:' || url.port || url.pathname !== '/core') return null
      return 'http://supervisor/core'
    }

    if (!isLanHostname(url.hostname)) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Resolves the one WS endpoint that cannot be derived by appending /api. */
export function homeAssistantWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.hostname === 'supervisor' && url.protocol === 'http:' && url.pathname === '/core') {
    return 'ws://supervisor/core/websocket'
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/websocket`
  return url.toString()
}

export async function getHAConfig() {
  const { config } = await db.read()
  const envUrlRaw = envValue('HA_URL')
  const envUrl = normalizeHAUrl(envUrlRaw)
  const storedUrlRaw = typeof config.haUrl === 'string' ? config.haUrl.trim() : ''
  const storedUrl = normalizeHAUrl(storedUrlRaw)
  const envToken = envValue('HA_TOKEN')
  const invalidUrl = Boolean(envUrlRaw ? !envUrl : storedUrlRaw && !storedUrl)
  const sourceUrl = envUrlRaw
    ? envUrl ? 'env' as const : 'invalid' as const
    : storedUrlRaw
      ? storedUrl ? 'db' as const : 'invalid' as const
      : 'default' as const

  return {
    // Never fall back to another destination when the explicitly configured
    // URL is invalid. An empty URL cannot be fetched by Node and keeps the HA
    // token fail-closed until the operator corrects the configuration.
    haUrl: invalidUrl ? '' : envUrl || storedUrl || DEFAULT_HA_URL,
    haToken: envToken || config.haToken,
    valid: !invalidUrl,
    source: {
      url: sourceUrl,
      token: envToken ? 'env' : config.haToken ? 'db' : 'missing',
    },
    locked: {
      haUrl: Boolean(envUrlRaw),
      haToken: Boolean(envToken),
    },
  }
}

export async function getHABaseUrl() {
  const config = await getHAConfig()
  if (!config.valid || !config.haUrl) throw new Error('URL Home Assistant non valido')
  return config.haUrl.replace(/\/$/, '')
}

export async function getHAWebSocketUrl() {
  return homeAssistantWebSocketUrl(await getHABaseUrl())
}
