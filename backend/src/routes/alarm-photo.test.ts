import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({ alarm: { photo: false } }))
vi.mock('../db/client.js', () => ({ db: { read: async () => ({ config }) } }))
import { alarmRouter } from './alarm.js'

const app = new Hono().route('/api/alarm', alarmRouter)
const image = `data:image/jpeg;base64,${jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data.toString('base64')}`
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
      const capturedAt = new Date().toISOString()
      expect((await post(capturedAt)).status).toBe(200)
      expect((await post(capturedAt)).status).toBe(200)
      expect(readdirSync(directory)).toHaveLength(1)
      config.alarm.photo = false
      expect((await post()).status).toBe(403)
      expect(readdirSync(directory)).toHaveLength(1)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
  it('rejects arbitrary bytes, false MIME, truncated and excessive-resolution JPEGs without writing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'myhome-alarm-invalid-'))
    vi.stubEnv('MYHOME_ALARM_DIR', directory)
    config.alarm.photo = true
    const oversized = jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data
    // Change SOF dimensions without allocating a huge fixture in the test.
    const frame = oversized.indexOf(Buffer.from([0xff, 0xc0]))
    expect(frame).toBeGreaterThan(0)
    oversized.writeUInt16BE(5000, frame + 5)
    oversized.writeUInt16BE(5000, frame + 7)
    const invalid = [
      `data:image/jpeg;base64,${Buffer.alloc(256, 1).toString('base64')}`,
      image.replace('image/jpeg', 'image/png'),
      `data:image/jpeg;base64,${Buffer.from(image.split(',')[1], 'base64').subarray(0, -12).toString('base64')}`,
      `data:image/jpeg;base64,${oversized.toString('base64')}`,
    ]
    try {
      for (const value of invalid) {
        const response = await app.request('/api/alarm/photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: value }),
        })
        expect(response.status).toBe(400)
      }
      expect(readdirSync(directory)).toEqual([])
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

})
