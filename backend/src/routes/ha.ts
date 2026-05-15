import { Hono } from 'hono'
import { db } from '../db/client.js'

export const haRouter = new Hono()

function envValue(key: string): string {
  const value = process.env[key] ?? ''
  return value.startsWith('your_') ? '' : value
}

function haConfig() {
  const { config } = db.read()
  return {
    haUrl: config.haUrl || envValue('VITE_HA_URL') || 'http://homeassistant.local:8123',
    haToken: config.haToken || envValue('HA_TOKEN') || envValue('VITE_HA_TOKEN'),
  }
}

haRouter.get('/health', async (c) => {
  const { haUrl, haToken } = haConfig()

  if (!haToken) {
    return c.json({ ok: false, error: 'Home Assistant token missing' }, 400)
  }

  try {
    const res = await fetch(`${haUrl.replace(/\/$/, '')}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
    })
    const body = await res.text()
    return c.json({
      ok: res.ok,
      status: res.status,
      message: body.slice(0, 200),
    }, res.ok ? 200 : 502)
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Home Assistant unreachable',
    }, 502)
  }
})
