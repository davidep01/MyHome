import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, expect, it } from 'vitest'

const databasePath = join(tmpdir(), `myhome-auth-test-${process.pid}.json`)
const previous = {
  NODE_ENV: process.env.NODE_ENV,
  MYHOME_AUTH_MODE: process.env.MYHOME_AUTH_MODE,
  MYHOME_ADMIN_TOKEN: process.env.MYHOME_ADMIN_TOKEN,
  MYHOME_KIOSK_TOKEN: process.env.MYHOME_KIOSK_TOKEN,
  MYHOME_DB_PATH: process.env.MYHOME_DB_PATH,
}

afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(databasePath, { force: true })
})

it('enforces signed roles even when the legacy client header is forged', async () => {
  process.env.NODE_ENV = 'production'
  process.env.MYHOME_AUTH_MODE = 'required'
  process.env.MYHOME_ADMIN_TOKEN = 'admin-test-secret'
  process.env.MYHOME_KIOSK_TOKEN = 'kiosk-test-secret'
  process.env.MYHOME_DB_PATH = databasePath

  const { app } = await import('./app.js')
  const forged = await app.request('/api/config', { headers: { 'X-MyHome-Client': 'desktop' } })
  expect(forged.status).toBe(401)
  expect(forged.headers.get('Access-Control-Allow-Origin')).toBeNull()

  const kioskLogin = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'kiosk-test-secret' }),
  })
  expect(kioskLogin.status).toBe(200)
  const kioskCookie = kioskLogin.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  expect((await app.request('/api/config', { headers: { Cookie: kioskCookie } })).status).toBe(403)
  expect((await app.request('/api/layout/home', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: kioskCookie },
    body: '{}',
  })).status).toBe(403)

  const adminLogin = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'admin-test-secret' }),
  })
  const adminCookie = adminLogin.headers.get('Set-Cookie')?.split(';')[0] ?? ''
  const arbitraryService = await app.request('/api/ha/services/homeassistant/restart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: '{}',
  })
  expect(arbitraryService.status).toBe(403)

  const prototypeDomain = await app.request('/api/ha/services/toString/valueOf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ entity_id: 'light.kitchen' }),
  })
  expect(prototypeDomain.status).toBe(403)

  const untargetedService = await app.request('/api/ha/services/light/turn_on', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: '{}',
  })
  expect(untargetedService.status).toBe(400)

  const broadTarget = await app.request('/api/ha/services/light/turn_on', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ entity_id: 'light.kitchen', target: { area_id: 'all' } }),
  })
  expect(broadTarget.status).toBe(400)

  const traversal = await app.request('/api/ha/media?path=%2Flocal%2F%252e%252e%2Fapi%2Fconfig', {
    headers: { Cookie: kioskCookie },
  })
  expect(traversal.status).toBe(400)

  const imageSsrf = await app.request('/api/ha/image?url=https%3A%2F%2F127.0.0.1%2Fsecret.png', {
    headers: { Cookie: kioskCookie },
  })
  expect(imageSsrf.status).toBe(403)

  const enableVision = await app.request('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ ai: { doorbellVision: true, faces: [] } }),
  })
  expect(enableVision.status).toBe(200)

  const arbitraryVision = await app.request('/api/ai/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: kioskCookie },
    body: JSON.stringify({ entityId: 'camera.not_a_doorbell', doorbellId: 'not-configured', names: ['Injected name'] }),
  })
  expect(arbitraryVision.status).toBe(403)

  const layoutResponse = await app.request('/api/layout/home', { headers: { Cookie: adminCookie } })
  const layout = await layoutResponse.json() as {
    layoutVersion: number
    layout: { items: Record<string, unknown>; order: string[] }
  }
  const update = {
    layoutVersion: layout.layoutVersion,
    items: layout.layout.items,
    order: layout.layout.order,
  }
  const concurrent = await Promise.all([
    app.request('/api/layout/home', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify(update),
    }),
    app.request('/api/layout/home', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify(update),
    }),
  ])
  expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409])

  const configResponse = await app.request('/api/config', { headers: { Cookie: adminCookie } })
  const config = await configResponse.json() as { home: Record<string, unknown> }
  const concurrentConfig = await Promise.all([
    app.request('/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ home: config.home }),
    }),
    app.request('/api/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ home: config.home }),
    }),
  ])
  expect(concurrentConfig.map((response) => response.status).sort()).toEqual([200, 409])

  const concurrentRooms = await Promise.all([
    app.request('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ label: 'Race Room', icon: 'home' }),
    }),
    app.request('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ label: 'Race Room', icon: 'home' }),
    }),
  ])
  expect(concurrentRooms.map((response) => response.status)).toEqual([201, 201])
  const createdRooms = await Promise.all(concurrentRooms.map((response) => response.json() as Promise<{ id: string; sortOrder: number }>))
  expect(new Set(createdRooms.map((room) => room.id)).size).toBe(2)
  expect(new Set(createdRooms.map((room) => room.sortOrder)).size).toBe(2)

  const duplicateEntities = await Promise.all([
    app.request(`/api/rooms/${encodeURIComponent(createdRooms[0].id)}/entities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ entityId: 'light.security_race', label: 'Race light', type: 'light' }),
    }),
    app.request(`/api/rooms/${encodeURIComponent(createdRooms[0].id)}/entities`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ entityId: 'light.security_race', label: 'Race light', type: 'light' }),
    }),
  ])
  expect(duplicateEntities.map((response) => response.status).sort()).toEqual([201, 409])

  const oversizedLogin = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.1' },
    body: JSON.stringify({ token: 'x'.repeat(1_100) }),
  })
  expect(oversizedLogin.status).toBe(413)

  // A valid login clears the failed reservation before the concurrency check.
  expect((await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'admin-test-secret' }),
  })).status).toBe(200)

  const parallelFailures = await Promise.all(Array.from({ length: 6 }, (_, index) => app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${index + 1}` },
    body: JSON.stringify({ token: 'wrong-secret' }),
  })))
  expect(parallelFailures.map((response) => response.status).sort()).toEqual([401, 401, 401, 401, 401, 429])
  expect((await app.request('/api/not-real', { headers: { Cookie: adminCookie } })).status).toBe(404)

  process.env.MYHOME_ADMIN_TOKEN = 'x'.repeat(513)
  expect((await app.request('/api/health')).status).toBe(503)
  expect((await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'x'.repeat(513) }),
  })).status).toBe(503)
})
