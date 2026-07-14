import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { enforceAllowedHost, isAllowedRequestHost } from './host-guard.js'

const previousAllowedHosts = process.env.MYHOME_ALLOWED_HOSTS

afterEach(() => {
  if (previousAllowedHosts === undefined) delete process.env.MYHOME_ALLOWED_HOSTS
  else process.env.MYHOME_ALLOWED_HOSTS = previousAllowedHosts
})

describe.sequential('DNS rebinding host guard', () => {
  it('allows LAN hosts and rejects a public Host header on the whole server', async () => {
    delete process.env.MYHOME_ALLOWED_HOSTS
    const app = new Hono()
    app.use('*', enforceAllowedHost)
    app.get('*', (c) => c.text('ok'))

    expect((await app.request('http://myhome/api/health', { headers: { Host: '192.168.1.20:3001' } })).status).toBe(200)
    expect((await app.request('http://myhome/login', { headers: { Host: 'kiosk.local:3001' } })).status).toBe(200)
    expect((await app.request('http://myhome/login', { headers: { Host: 'tablet.casa.lan:3001' } })).status).toBe(200)
    expect((await app.request('http://myhome/', { headers: { Host: 'myhome' } })).status).toBe(200)
    expect((await app.request('http://myhome/api/health', { headers: { Host: 'attacker.example' } })).status).toBe(403)
  })

  it('accepts only exact custom hosts from MYHOME_ALLOWED_HOSTS', () => {
    process.env.MYHOME_ALLOWED_HOSTS = 'dashboard.example.com, 203.0.113.8'
    expect(isAllowedRequestHost('dashboard.example.com:443')).toBe(true)
    expect(isAllowedRequestHost('203.0.113.8:3001')).toBe(true)
    expect(isAllowedRequestHost('sub.dashboard.example.com')).toBe(false)
  })
})
