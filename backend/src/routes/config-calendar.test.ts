import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databasePath = join(tmpdir(), `myhome-calendar-config-test-${process.pid}.json`)
const previous = {
  NODE_ENV: process.env.NODE_ENV,
  MYHOME_AUTH_MODE: process.env.MYHOME_AUTH_MODE,
  MYHOME_DB_PATH: process.env.MYHOME_DB_PATH,
  MYHOME_READ_ONLY: process.env.MYHOME_READ_ONLY,
}

let app: typeof import('../app.js')['app']

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  delete process.env.MYHOME_AUTH_MODE
  delete process.env.MYHOME_READ_ONLY
  process.env.MYHOME_DB_PATH = databasePath
  app = (await import('../app.js')).app
})

afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(databasePath, { force: true })
})

const desktop = { 'Content-Type': 'application/json', 'X-MyHome-Client': 'desktop' }
async function configWrite(body: Record<string, unknown>) {
  const current = await (await app.request('/api/config', { headers: desktop })).json() as { configVersion: number }
  return app.request('/api/config', { method: 'PUT', headers: desktop, body: JSON.stringify({ ...body, configVersion: current.configVersion }) })
}


describe('calendar link persistence', () => {
  it('saves a webcal link as normalized HTTPS and returns it after a refetch', async () => {
    const save = await configWrite({ calendarFeedUrl: 'webcal://calendar.example.com/family.ics' })
    expect(save.status).toBe(200)

    const read = await app.request('/api/config', { headers: { 'X-MyHome-Client': 'desktop' } })
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ calendarFeedUrl: 'https://calendar.example.com/family.ics' })
  })

  it('can clear the saved calendar link', async () => {
    const clear = await configWrite({ calendarFeedUrl: '' })
    expect(clear.status).toBe(200)

    const read = await app.request('/api/config', { headers: { 'X-MyHome-Client': 'desktop' } })
    expect(await read.json()).toMatchObject({ calendarFeedUrl: '' })
  })
})


describe('emergency settings persistence', () => {
  it('persists emergency photo and shortcuts and projects them to the kiosk', async () => {
    const alarm = { photo: true, shortcuts: [{ id: 'lights', label: 'Accendi luci', entityId: 'light.kitchen', service: 'turn_on' }] }
    const save = await configWrite({ alarm })
    expect(save.status).toBe(200)
    const read = await app.request('/api/config', { headers: desktop })
    expect(await read.json()).toMatchObject({ alarm })
    const kiosk = await app.request('/api/layout/home')
    expect(await kiosk.json()).toMatchObject({ alarm })
  })

  it('persists disabling photos and removing every emergency shortcut', async () => {
    const alarm = { photo: false, shortcuts: [] }
    const save = await configWrite({ alarm })
    expect(save.status).toBe(200)
    const read = await app.request('/api/config', { headers: desktop })
    expect(await read.json()).toMatchObject({ alarm })
  })
})


describe('portable backup restore', () => {
  it('retains local credentials and creates a fresh local layout revision', async () => {
    const { db } = await import('../db/client.js')
    await db.write((store) => {
      store.config.haUrl = 'http://192.168.1.20:8123'
      store.config.haToken = 'installation-local-test-token'
      store.config.alarm = { photo: true }
      store.config.ai = { doorbellVision: true }
      store.config.kiosk = { homeMode: 'grid' }
    })
    const before = await db.read()
    const exported = await app.request('/api/config/export', { headers: desktop })
    const backup = await exported.json() as { secretsIncluded: boolean; store: typeof before }
    expect(backup.secretsIncluded).toBe(false)
    expect(backup.store.config.haToken).toBe('***')
    delete backup.store.config.alarm
    delete backup.store.config.ai
    delete backup.store.config.kiosk
    backup.store.config.haUrl = 'http://192.168.1.99:8123'
    backup.store.config.haToken = 'foreign-backup-test-token'
    backup.store.config.home = {
      widgets: [{ id: 'backup-clock', type: 'clock', size: 'sm' }],
      layoutVersion: 999,
      updatedAt: '2000-01-01T00:00:00.000Z',
    }
    const restored = await app.request('/api/config/import', {
      method: 'POST', headers: desktop, body: JSON.stringify(backup),
    })
    expect(restored.status).toBe(200)
    const after = await db.read()
    expect(after.config.alarm).toBeUndefined()
    expect(after.config.ai).toBeUndefined()
    expect(after.config.kiosk).toBeUndefined()
    expect(after.config.haToken).toBe(before.config.haToken)
    expect(after.config.haUrl).toBe(before.config.haUrl)
    expect(after.config.home?.layoutVersion).toBe((before.config.home?.layoutVersion ?? 1) + 1)
    expect(Date.parse(after.config.home!.updatedAt!)).toBeGreaterThan(Date.parse('2000-01-01'))
    expect(after.homeRevisions?.at(-1)?.home.widgets[0].id).toBe('backup-clock')
  })
})

describe('configuration compare and swap', () => {
  it('rejects stale nested settings instead of silently overwriting a second client', async () => {
    const current = await (await app.request('/api/config', { headers: desktop })).json() as { configVersion: number }
    const save = (kiosk: unknown) => app.request('/api/config', { method: 'PUT', headers: desktop, body: JSON.stringify({ configVersion: current.configVersion, kiosk }) })
    const results = await Promise.all([save({ homeMode: 'grid' }), save({ wakeEntityId: 'binary_sensor.presenza' })])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    const next = await (await app.request('/api/config', { headers: desktop })).json() as { configVersion: number }
    expect(next.configVersion).toBe(current.configVersion + 1)
    const stale = await save({ homeMode: 'composer' })
    expect(stale.status).toBe(409)
  })
  it('rejects unversioned configuration writes', async () => {
    const response = await app.request('/api/config', { method: 'PUT', headers: desktop, body: JSON.stringify({ alarm: { photo: false } }) })
    expect(response.status).toBe(409)
  })
})
