import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databasePath = join(tmpdir(), `myhome-layout-test-${process.pid}.json`)
const previous = {
  NODE_ENV: process.env.NODE_ENV,
  MYHOME_AUTH_MODE: process.env.MYHOME_AUTH_MODE,
  MYHOME_DB_PATH: process.env.MYHOME_DB_PATH,
}

let app: typeof import('../app.js')['app']

beforeAll(async () => {
  // Auth OFF (the new default): the desktop client hint grants the admin role,
  // so the wall tablet can manage its own home without any login.
  process.env.NODE_ENV = 'test'
  delete process.env.MYHOME_AUTH_MODE
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

async function getLayout() {
  const res = await app.request('/api/layout/home', { headers: { 'X-MyHome-Client': 'desktop' } })
  return res.json() as Promise<{
    layoutVersion: number
    widgets: { id: string; type: string; size: string }[]
    layout: { items: Record<string, { x: number; y: number; w: number; h: number }>; order: string[] }
  }>
}

describe('home widget manager (auth disabled)', () => {
  it('reads the home without a login', async () => {
    const res = await app.request('/api/layout/home', { headers: { 'X-MyHome-Client': 'desktop' } })
    expect(res.status).toBe(200)
  })

  it('adds a widget and persists it', async () => {
    const before = await getLayout()
    const widgets = [...before.widgets, { id: 'w-new-light', type: 'entity', size: 'xs', entityId: 'light.test' }]
    const items = { ...before.layout.items, 'w-new-light': { x: 0, y: 100, w: 1, h: 2 } }
    const res = await app.request('/api/layout/home', {
      method: 'PUT', headers: desktop,
      body: JSON.stringify({ layoutVersion: before.layoutVersion, widgets, items, order: [...before.layout.order, 'w-new-light'] }),
    })
    expect(res.status).toBe(200)
    const after = await getLayout()
    expect(after.widgets.find((w) => w.id === 'w-new-light')?.size).toBe('xs')
    expect(after.layoutVersion).toBeGreaterThan(before.layoutVersion)
  })

  it('removes a widget', async () => {
    const before = await getLayout()
    const widgets = before.widgets.filter((w) => w.id !== 'w-new-light')
    const items = Object.fromEntries(Object.entries(before.layout.items).filter(([id]) => id !== 'w-new-light'))
    const res = await app.request('/api/layout/home', {
      method: 'PUT', headers: desktop,
      body: JSON.stringify({ layoutVersion: before.layoutVersion, widgets, items }),
    })
    expect(res.status).toBe(200)
    const after = await getLayout()
    expect(after.widgets.some((w) => w.id === 'w-new-light')).toBe(false)
  })

  it('rejects an invalid widget list with 400 (no silent drop)', async () => {
    const before = await getLayout()
    const res = await app.request('/api/layout/home', {
      method: 'PUT', headers: desktop,
      body: JSON.stringify({ layoutVersion: before.layoutVersion, widgets: [{ id: 'bad', type: 'nope', size: 'sm' }], items: {} }),
    })
    expect(res.status).toBe(400)
  })

  it('serialises concurrent widget saves (one 200, one 409)', async () => {
    const before = await getLayout()
    const widgets = [...before.widgets, { id: 'w-race', type: 'clock', size: 'sm' }]
    const body = JSON.stringify({
      layoutVersion: before.layoutVersion,
      widgets,
      items: { ...before.layout.items, 'w-race': { x: 2, y: 100, w: 1, h: 3 } },
    })
    const [a, b] = await Promise.all([
      app.request('/api/layout/home', { method: 'PUT', headers: desktop, body }),
      app.request('/api/layout/home', { method: 'PUT', headers: desktop, body }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })
})
