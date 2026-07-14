import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

export type JsonReadFailure = {
  ok: false
  status: 400 | 413 | 415
  error: string
}

export type JsonReadResult = JsonReadFailure | { ok: true; value: unknown }

export function containsControlCharacters(value: string, allowLineWhitespace = false): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code === 127) return true
    if (code < 32 && !(allowLineWhitespace && (code === 9 || code === 10 || code === 13))) return true
  }
  return false
}

export function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

/** Parse JSON without allowing an unbounded request body into memory. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonReadResult> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
  if (contentType !== 'application/json' && !contentType.endsWith('+json')) {
    return { ok: false, status: 415, error: 'Content-Type application/json richiesto' }
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength) {
    const length = Number(declaredLength)
    if (!Number.isSafeInteger(length) || length < 0) {
      return { ok: false, status: 400, error: 'Content-Length non valido' }
    }
    if (length > maxBytes) return { ok: false, status: 413, error: 'Richiesta troppo grande' }
  }

  if (!request.body) return { ok: false, status: 400, error: 'Corpo JSON mancante' }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, status: 413, error: 'Richiesta troppo grande' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400, error: 'Corpo della richiesta non leggibile' }
  }

  if (total === 0) return { ok: false, status: 400, error: 'Corpo JSON mancante' }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch {
    return { ok: false, status: 400, error: 'JSON non valido' }
  }
}

export class OutboundRequestError extends Error {
  constructor(readonly reason: 'timeout' | 'too_large' | 'invalid_response' | 'unsafe_url' | 'network') {
    super(reason)
    this.name = 'OutboundRequestError'
  }
}

export interface LimitedFetchResult {
  response: Response
  bytes: Uint8Array
  finalUrl: URL
}

interface LimitedFetchOptions {
  timeoutMs: number
  maxBytes: number
  maxRedirects?: number
  requirePublicHttps?: boolean
  allowedHosts?: ReadonlySet<string>
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = octets
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 168)
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
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
  const parts = [...left, ...Array(missing).fill('0'), ...right]
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null
  return parts.map((part) => Number.parseInt(part, 16))
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const parts = ipv6Hextets(address)
  if (!parts) return true
  if (parts.every((part) => part === 0)) return true
  if (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) return true
  const first = parts[0]
  if ((first & 0xfe00) === 0xfc00) return true // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return true
  if ((first & 0xff00) === 0xff00) return true // multicast
  if (first === 0x2001 && parts[1] === 0x0db8) return true // documentation

  const isMapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
  if (isMapped) {
    const embedded = `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`
    return isPrivateOrReservedIpv4(embedded)
  }
  if (first === 0x2002) {
    const embedded = `${parts[1] >> 8}.${parts[1] & 255}.${parts[2] >> 8}.${parts[2] & 255}`
    return isPrivateOrReservedIpv4(embedded)
  }
  return false
}

export function isPrivateOrReservedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isPrivateOrReservedIpv4(address)
  if (family === 6) return isPrivateOrReservedIpv6(address)
  return true
}

/** Reject local/reserved targets before each outbound RSS request and redirect. */
export async function assertPublicHttpsUrl(
  input: string | URL,
  allowedHosts?: ReadonlySet<string>,
): Promise<URL> {
  let url: URL
  try {
    url = input instanceof URL ? new URL(input) : new URL(input)
  } catch {
    throw new OutboundRequestError('unsafe_url')
  }
  if (url.toString().length > 2_048 || url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new OutboundRequestError('unsafe_url')
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) {
    throw new OutboundRequestError('unsafe_url')
  }
  if (allowedHosts?.size && !allowedHosts.has(hostname)) throw new OutboundRequestError('unsafe_url')

  const directFamily = isIP(hostname)
  if (directFamily && isPrivateOrReservedAddress(hostname)) throw new OutboundRequestError('unsafe_url')
  try {
    const addresses = directFamily ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true })
    if (!addresses.length || addresses.some(({ address }: { address: string }) => isPrivateOrReservedAddress(address))) {
      throw new OutboundRequestError('unsafe_url')
    }
  } catch (error) {
    if (error instanceof OutboundRequestError) throw error
    throw new OutboundRequestError('network')
  }
  return url
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength) {
    const length = Number(declaredLength)
    if (Number.isFinite(length) && length > maxBytes) throw new OutboundRequestError('too_large')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new OutboundRequestError('too_large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Fetch with a single end-to-end deadline, a response cap and safe redirects. */
export async function fetchWithLimits(
  input: string | URL,
  init: RequestInit,
  options: LimitedFetchOptions,
): Promise<LimitedFetchResult> {
  const deadline = Date.now() + options.timeoutMs
  const maxRedirects = options.maxRedirects ?? 0
  let redirects = 0
  let current = input instanceof URL ? new URL(input) : new URL(input)

  while (true) {
    if (options.requirePublicHttps) {
      const validationRemaining = deadline - Date.now()
      if (validationRemaining <= 0) throw new OutboundRequestError('timeout')
      let validationTimer: ReturnType<typeof setTimeout> | undefined
      try {
        current = await Promise.race([
          assertPublicHttpsUrl(current, options.allowedHosts),
          new Promise<never>((_resolve, reject) => {
            validationTimer = setTimeout(() => reject(new OutboundRequestError('timeout')), validationRemaining)
          }),
        ])
      } finally {
        if (validationTimer) clearTimeout(validationTimer)
      }
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new OutboundRequestError('timeout')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), remaining)
    try {
      const response = await fetch(current, { ...init, redirect: 'manual', signal: controller.signal })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel().catch(() => undefined)
        if (!location || redirects >= maxRedirects) throw new OutboundRequestError('invalid_response')
        current = new URL(location, current)
        redirects += 1
        continue
      }
      const bytes = await readResponseBytes(response, options.maxBytes)
      return { response, bytes, finalUrl: current }
    } catch (error) {
      if (error instanceof OutboundRequestError) throw error
      if (controller.signal.aborted) throw new OutboundRequestError('timeout')
      throw new OutboundRequestError('network')
    } finally {
      clearTimeout(timer)
    }
  }
}

export function decodeJsonResponse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new OutboundRequestError('invalid_response')
  }
}

export class BoundedTtlCache<T> {
  private readonly values = new Map<string, { expiresAt: number; value: T }>()

  constructor(private readonly maxEntries: number) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.values.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
      this.values.delete(key)
      return undefined
    }
    this.values.delete(key)
    this.values.set(key, entry)
    return entry.value
  }

  set(key: string, value: T, ttlMs: number, now = Date.now()): void {
    this.values.delete(key)
    for (const [existingKey, entry] of this.values) {
      if (entry.expiresAt <= now) this.values.delete(existingKey)
    }
    while (this.values.size >= this.maxEntries) {
      const oldest = this.values.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.values.delete(oldest)
    }
    this.values.set(key, { expiresAt: now + ttlMs, value })
  }

  get size(): number {
    return this.values.size
  }
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 256,
  ) {}

  consume(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    let window = this.windows.get(key)
    if (!window || now - window.startedAt >= this.windowMs) {
      window = { startedAt: now, count: 0 }
      this.windows.delete(key)
      if (this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value as string | undefined
        if (oldest !== undefined) this.windows.delete(oldest)
      }
      this.windows.set(key, window)
    }
    if (window.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + this.windowMs - now) / 1_000)),
      }
    }
    window.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }
}

/** Uses the TCP peer, not spoofable forwarding headers, for LAN rate limits. */
export function connectionKey(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function rateLimitResponse(
  c: Context,
  limiter: FixedWindowRateLimiter,
  scope: string,
): Response | null {
  const result = limiter.consume(`${scope}:${connectionKey(c)}`)
  if (result.allowed) return null
  c.header('Retry-After', String(result.retryAfterSeconds))
  c.header('Cache-Control', 'no-store')
  return c.json({ error: 'Troppe richieste, riprova tra poco' }, 429)
}
