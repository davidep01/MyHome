import { afterEach, describe, expect, it } from 'vitest'
import {
  authConfiguration,
  createSession,
  roleForAccessToken,
  sessionCookie,
  verifySession,
} from './security.js'

const AUTH_KEYS = ['NODE_ENV', 'MYHOME_AUTH_MODE', 'MYHOME_ADMIN_TOKEN', 'MYHOME_ACCESS_TOKEN', 'MYHOME_KIOSK_TOKEN'] as const
const original = Object.fromEntries(AUTH_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of AUTH_KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe.sequential('LAN authentication', () => {
  it('fails closed in production when the admin secret is absent', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.MYHOME_ADMIN_TOKEN
    delete process.env.MYHOME_ACCESS_TOKEN
    expect(authConfiguration().mode).toBe('misconfigured')
  })

  it('cannot disable authentication in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYHOME_AUTH_MODE = 'disabled'
    process.env.MYHOME_ADMIN_TOKEN = 'admin-secret'
    expect(authConfiguration().mode).toBe('required')
  })

  it('derives roles only from their configured access codes', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYHOME_ADMIN_TOKEN = 'admin-secret'
    process.env.MYHOME_KIOSK_TOKEN = 'kiosk-secret'
    expect(roleForAccessToken('admin-secret')).toBe('admin')
    expect(roleForAccessToken('kiosk-secret')).toBe('kiosk')
    expect(roleForAccessToken('wrong')).toBeNull()
  })

  it('fails closed instead of promoting a kiosk when both codes are equal', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYHOME_AUTH_MODE = 'required'
    process.env.MYHOME_ADMIN_TOKEN = 'same-secret-123'
    process.env.MYHOME_KIOSK_TOKEN = 'same-secret-123'
    expect(authConfiguration()).toMatchObject({
      mode: 'misconfigured',
      kioskEnabled: false,
      error: 'duplicate_tokens',
    })
    expect(roleForAccessToken('same-secret-123')).toBeNull()
  })

  it('rejects access codes outside the accepted length range', () => {
    process.env.NODE_ENV = 'production'
    process.env.MYHOME_ADMIN_TOKEN = 'short'
    expect(authConfiguration()).toMatchObject({ mode: 'misconfigured', error: 'invalid_tokens' })
    process.env.MYHOME_ADMIN_TOKEN = 'x'.repeat(513)
    expect(authConfiguration()).toMatchObject({ mode: 'misconfigured', error: 'invalid_tokens' })
  })

  it('rejects a modified signed session and emits a hardened cookie', () => {
    process.env.MYHOME_ADMIN_TOKEN = 'admin-secret'
    process.env.MYHOME_KIOSK_TOKEN = 'kiosk-secret'
    const session = createSession('admin')
    expect(verifySession(session)).toBe('admin')
    expect(verifySession(`${session.slice(0, -1)}x`)).toBeNull()
    expect(sessionCookie(session, true, 'admin')).toContain('HttpOnly')
    expect(sessionCookie(session, true, 'admin')).toContain('SameSite=Strict')
    expect(sessionCookie(session, true, 'admin')).toContain('Secure')
  })
})
