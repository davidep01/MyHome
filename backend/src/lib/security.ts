import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

export type ClientContext = 'desktop' | 'tablet' | 'unknown'
export type AuthRole = 'admin' | 'kiosk'
export type AuthMode = 'disabled' | 'required' | 'misconfigured'

const SESSION_COOKIE = 'myhome_session'
const ADMIN_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const KIOSK_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
const MIN_ACCESS_TOKEN_LENGTH = 12
const MAX_ACCESS_TOKEN_LENGTH = 512
const requestRoles = new WeakMap<Request, AuthRole>()

function envValue(key: string): string {
  const value = process.env[key]?.trim() ?? ''
  if (!value || value.startsWith('your_')) return ''
  return value
}

export function authConfiguration() {
  const adminToken = envValue('MYHOME_ADMIN_TOKEN') || envValue('MYHOME_ACCESS_TOKEN')
  const kioskToken = envValue('MYHOME_KIOSK_TOKEN')
  const requested = envValue('MYHOME_AUTH_MODE').toLowerCase()
  // Login is OFF by default: MyHome is a single-home LAN dashboard and the owner
  // wants immediate access on every device, admin and kiosk alike. Codes come
  // back only when the operator explicitly opts in with MYHOME_AUTH_MODE=required.
  const required = requested === 'required'
  // Equal access codes are ambiguous. Checking the admin code first would turn
  // a kiosk login into an administrator session, so fail the whole auth setup
  // closed until the operator configures two distinct values.
  const adminTokenValid = validAccessToken(adminToken)
  const kioskTokenValid = !kioskToken || validAccessToken(kioskToken)
  const invalidTokens = !adminTokenValid || !kioskTokenValid
  const duplicateTokens = Boolean(adminTokenValid && kioskToken && kioskTokenValid && equalSecret(adminToken, kioskToken))
  const mode: AuthMode = required && (invalidTokens || duplicateTokens) ? 'misconfigured' : required ? 'required' : 'disabled'
  return {
    mode,
    adminToken,
    kioskToken,
    kioskEnabled: Boolean(kioskToken) && kioskTokenValid && !duplicateTokens,
    error: duplicateTokens
      ? 'duplicate_tokens' as const
      : !adminToken
        ? 'missing_admin_token' as const
        : invalidTokens
          ? 'invalid_tokens' as const
          : null,
  }
}

function validAccessToken(value: string): boolean {
  return value.length >= MIN_ACCESS_TOKEN_LENGTH && value.length <= MAX_ACCESS_TOKEN_LENGTH
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function equalSecret(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false
  return timingSafeEqual(digest(candidate), digest(expected))
}

function sessionKey(): Buffer {
  const { adminToken, kioskToken } = authConfiguration()
  return digest(`myhome-session\0${adminToken}\0${kioskToken}`)
}

function sign(payload: string): string {
  return createHmac('sha256', sessionKey()).update(payload).digest('base64url')
}

export function createSession(role: AuthRole): string {
  const maxAge = role === 'kiosk' ? KIOSK_SESSION_MAX_AGE_SECONDS : ADMIN_SESSION_MAX_AGE_SECONDS
  const payload = Buffer.from(JSON.stringify({
    role,
    expiresAt: Date.now() + maxAge * 1000,
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function verifySession(value: string | undefined): AuthRole | null {
  if (!value) return null
  const [payload, signature, extra] = value.split('.')
  if (!payload || !signature || extra) return null
  if (!equalSecret(signature, sign(payload))) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: unknown
      expiresAt?: unknown
    }
    if ((parsed.role !== 'admin' && parsed.role !== 'kiosk') || typeof parsed.expiresAt !== 'number') return null
    if (parsed.expiresAt <= Date.now()) return null
    return parsed.role
  } catch {
    return null
  }
}

export function verifySessionCookie(request: Request): AuthRole | null {
  return verifySession(cookieValue(request.headers.get('Cookie') ?? undefined, SESSION_COOKIE))
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const item of header.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(item.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export function sessionCookie(value: string, secure: boolean, role: AuthRole): string {
  const maxAge = role === 'kiosk' ? KIOSK_SESSION_MAX_AGE_SECONDS : ADMIN_SESSION_MAX_AGE_SECONDS
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function requestIsSecure(url: string, forwardedProto?: string): boolean {
  const override = envValue('MYHOME_COOKIE_SECURE').toLowerCase()
  if (override === 'true') return true
  if (override === 'false') return false
  return forwardedProto?.split(',')[0].trim() === 'https' || new URL(url).protocol === 'https:'
}

export function roleForAccessToken(token: string): AuthRole | null {
  const config = authConfiguration()
  if (config.mode === 'misconfigured') return null
  if (equalSecret(token, config.adminToken)) return 'admin'
  if (equalSecret(token, config.kioskToken)) return 'kiosk'
  return null
}

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

/**
 * Establishes the trusted role once for every API request. In authenticated
 * deployments the role comes only from the signed HttpOnly session. The legacy
 * client hint is consulted solely in explicitly-open development mode.
 */
export const authenticateRequest: MiddlewareHandler = async (c, next) => {
  const path = c.req.path
  if (path === '/api/health' || path.startsWith('/api/auth/')) {
    await next()
    return
  }

  const config = authConfiguration()
  if (config.mode === 'misconfigured') {
    return c.json({
      error: 'Autenticazione non configurata',
      action: 'Imposta MYHOME_ADMIN_TOKEN e, per il tablet, MYHOME_KIOSK_TOKEN.',
    }, 503)
  }

  const hint = config.mode === 'disabled'
    ? clientContextFromRequest(
        (name) => c.req.header(name) ?? undefined,
        (name) => c.req.query(name) ?? undefined,
      )
    : null
  const role: AuthRole | null = config.mode === 'required'
    ? verifySessionCookie(c.req.raw)
    : hint === 'tablet' ? 'kiosk' : 'admin'

  if (!role) return c.json({ error: 'Accesso richiesto' }, 401)
  requestRoles.set(c.req.raw, role)
  await next()
}

export function authRole(request: Request): AuthRole | null {
  return requestRoles.get(request) ?? null
}

export const adminOnly: MiddlewareHandler = async (c, next) => {
  if (authRole(c.req.raw) !== 'admin') return c.json({ error: 'Permessi amministratore richiesti' }, 403)
  await next()
}

/** Backwards-compatible name used by existing admin routes. */
export const desktopOnly = adminOnly
