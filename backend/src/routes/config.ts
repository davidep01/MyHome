import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { AppConfig } from '../db/types.js'

export const configRouter = new Hono()

configRouter.get('/', (c) => {
  const { config } = db.read()
  // Never return the HA token in plaintext — mask it
  return c.json({
    ...config,
    haToken: config.haToken ? '***' : '',
  })
})

// Separate endpoint to read full token (for internal use / WS connection)
configRouter.get('/ha-credentials', (c) => {
  const { config } = db.read()
  return c.json({ haUrl: config.haUrl, haToken: config.haToken })
})

configRouter.put('/', async (c) => {
  const body = await c.req.json<Partial<AppConfig>>()
  db.write((store) => {
    if (body.haUrl !== undefined) store.config.haUrl = body.haUrl
    if (body.haToken !== undefined && body.haToken !== '***') store.config.haToken = body.haToken
    if (body.weatherCity !== undefined) store.config.weatherCity = body.weatherCity
    if (body.newsCategory !== undefined) store.config.newsCategory = body.newsCategory
    if (body.newsFeedUrl !== undefined) store.config.newsFeedUrl = body.newsFeedUrl
    if (body.userName !== undefined) store.config.userName = body.userName
    if (body.dashboardName !== undefined) store.config.dashboardName = body.dashboardName
  })
  return c.json({ ok: true })
})
