import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { AppConfig } from '../db/types.js'
import { getHAConfig } from '../lib/ha-config.js'

export const configRouter = new Hono()

configRouter.get('/', async (c) => {
  const { config } = await db.read()
  const ha = await getHAConfig()
  // Never return the HA token in plaintext — mask it
  return c.json({
    ...config,
    haUrl: ha.haUrl,
    haToken: ha.haToken ? '***' : '',
    haConfigSource: ha.source,
    haConfigLocked: ha.locked,
    storage: {
      writable: db.writable,
      mode: db.mode,
    },
  })
})

// Separate endpoint to read full token (for internal use / WS connection)
configRouter.get('/ha-credentials', async (c) => {
  const { haUrl, haToken } = await getHAConfig()
  return c.json({ haUrl, haToken })
})

configRouter.put('/', async (c) => {
  const body = await c.req.json<Partial<AppConfig>>()
  const ha = await getHAConfig()
  const ok = await db.write((store) => {
    if (body.haUrl !== undefined && !ha.locked.haUrl) store.config.haUrl = body.haUrl
    if (body.haToken !== undefined && body.haToken !== '***' && !ha.locked.haToken) store.config.haToken = body.haToken
    if (body.weatherCity !== undefined) store.config.weatherCity = body.weatherCity
    if (body.newsCategory !== undefined) store.config.newsCategory = body.newsCategory
    if (body.newsFeedUrl !== undefined) store.config.newsFeedUrl = body.newsFeedUrl
    if (body.userName !== undefined) store.config.userName = body.userName
    if (body.dashboardName !== undefined) store.config.dashboardName = body.dashboardName
  })
  if (!ok) return c.json({ error: 'Configuration could not be saved' }, 500)
  return c.json({ ok: true })
})
