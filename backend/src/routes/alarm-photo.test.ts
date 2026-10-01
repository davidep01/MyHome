import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({ alarm: { photo: false } }))
vi.mock('../db/client.js', () => ({ db: { read: async () => ({ config }) } }))
import { alarmRouter } from './alarm.js'

const app = new Hono().route('/api/alarm', alarmRouter)
const image = `data:image/jpeg;base64,${Buffer.alloc(128, 1).toString('base64')}`
const post = (takenAt = new Date().toISOString()) => app.request('/api/alarm/photo', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image, alertId: 'audit', takenAt }),
})

afterEach(() => { config.alarm.photo = false; vi.unstubAllEnvs() })

describe('emergency photo storage', () => {
  it('enforces the saved photo opt-in on the server', async () => {
    expect((await post()).status).toBe(403)
  })
  it('stores opted-in photos and rejects dates outside the retention filename format', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'myhome-alarm-photo-'))
    vi.stubEnv('MYHOME_ALARM_DIR', directory)
    vi.stubEnv('MYHOME_READ_ONLY', 'false')
    config.alarm.photo = true
    try {
      expect((await post('invalid')).status).toBe(400)
      expect((await post('+010000-01-01T00:00:00.000Z')).status).toBe(400)
      expect((await post()).status).toBe(200)
      expect(readdirSync(directory)).toHaveLength(1)
      config.alarm.photo = false
      expect((await post()).status).toBe(403)
      expect(readdirSync(directory)).toHaveLength(1)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
