import { Hono, type Context } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import {
  authConfiguration,
  clearSessionCookie,
  createSession,
  requestIsSecure,
  roleForAccessToken,
  sessionCookie,
  verifySessionCookie,
} from '../lib/security.js'
import { readJsonBody } from '../lib/request-safety.js'

export const authRouter = new Hono()

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5
const failures = new Map<string, { count: number; resetAt: number }>()

function clientKey(c: Context): string {
  // Use only the TCP peer. An unauthenticated X-Forwarded-For value would let
  // any LAN caller rotate identities and bypass the login limiter.
  try {
    return getConnInfo(c).remote.address ?? 'local'
  } catch {
    return 'local'
  }
}

function secureCookie(request: Request): boolean {
  // Forwarded headers are not trusted in the LAN-only deployment. Operators
  // terminating TLS elsewhere can explicitly set MYHOME_COOKIE_SECURE=true.
  return requestIsSecure(request.url)
}

function failureState(key: string) {
  if (failures.size > 1_000) {
    const now = Date.now()
    for (const [candidate, state] of failures) {
      if (state.resetAt <= now || failures.size > 1_000) failures.delete(candidate)
    }
  }
  const current = failures.get(key)
  if (!current || current.resetAt <= Date.now()) {
    const fresh = { count: 0, resetAt: Date.now() + WINDOW_MS }
    failures.set(key, fresh)
    return fresh
  }
  return current
}

authRouter.get('/status', (c) => {
  const config = authConfiguration()
  const role = verifySessionCookie(c.req.raw)
  return c.json({
    mode: config.mode,
    authenticated: config.mode === 'disabled' || (config.mode === 'required' && Boolean(role)),
    role: config.mode === 'misconfigured' ? null : role ?? (config.mode === 'disabled' ? 'admin' : null),
    kioskEnabled: config.kioskEnabled,
    message: config.mode === 'misconfigured'
      ? config.error === 'duplicate_tokens'
        ? 'I codici amministratore e kiosk devono essere diversi.'
        : config.error === 'invalid_tokens'
          ? 'I codici di accesso devono contenere da 12 a 512 caratteri.'
        : 'Imposta MYHOME_ADMIN_TOKEN prima di esporre MyHome.'
      : undefined,
  })
})

authRouter.post('/login', async (c) => {
  const config = authConfiguration()
  if (config.mode === 'misconfigured') {
    return c.json({ error: 'Autenticazione non configurata sul server' }, 503)
  }
  if (config.mode === 'disabled') {
    return c.json({ ok: true, role: 'admin' as const })
  }

  const key = clientKey(c)
  const state = failureState(key)
  if (state.count >= MAX_FAILURES) {
    c.header('Retry-After', String(Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000))))
    return c.json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' }, 429)
  }
  // Reserve before the first await so parallel requests cannot all observe the
  // same counter value and cross the failure limit together.
  state.count += 1

  const parsed = await readJsonBody(c.req.raw, 1_024)
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
  const body = parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? parsed.value as { token?: unknown }
    : null
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (token.length < 12 || token.length > 512) {
    return c.json({ error: 'Codice di accesso non valido' }, 400)
  }

  const role = roleForAccessToken(token)
  if (!role) {
    return c.json({ error: 'Codice di accesso non corretto' }, 401)
  }

  failures.delete(key)
  c.header('Set-Cookie', sessionCookie(createSession(role), secureCookie(c.req.raw), role))
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, role })
})

authRouter.post('/logout', (c) => {
  c.header('Set-Cookie', clearSessionCookie(secureCookie(c.req.raw)))
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true })
})
