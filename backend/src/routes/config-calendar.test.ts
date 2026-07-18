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

describe('calendar link persistence', () => {
  it('saves a webcal link as normalized HTTPS and returns it after a refetch', async () => {
    const save = await app.request('/api/config', {
      method: 'PUT',
      headers: desktop,
      body: JSON.stringify({ calendarFeedUrl: 'webcal://calendar.example.com/family.ics' }),
    })
    expect(save.status).toBe(200)

    const read = await app.request('/api/config', { headers: { 'X-MyHome-Client': 'desktop' } })
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ calendarFeedUrl: 'https://calendar.example.com/family.ics' })
  })

  it('can clear the saved calendar link', async () => {
    const clear = await app.request('/api/config', {
      method: 'PUT',
      headers: desktop,
      body: JSON.stringify({ calendarFeedUrl: '' }),
    })
    expect(clear.status).toBe(200)

    const read = await app.request('/api/config', { headers: { 'X-MyHome-Client': 'desktop' } })
    expect(await read.json()).toMatchObject({ calendarFeedUrl: '' })
  })
})
