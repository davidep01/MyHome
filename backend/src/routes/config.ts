import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/client.js'
import type { AppConfig } from '../db/types.js'
import { getHAConfig } from '../lib/ha-config.js'
import { configEvents, emitConfigChange } from '../lib/configEvents.js'

export const configRouter = new Hono()

// Live config stream — every client subscribes and refetches on a change,
// so a global dashboard edit on one device propagates to all devices live.
configRouter.get('/stream', (c) =>
  streamSSE(c, async (stream) => {
    let pending = false
    let closed = false
    const onChange = () => { pending = true }
    configEvents.on('change', onChange)
    stream.onAbort(() => { closed = true })

    await stream.writeSSE({ event: 'ready', data: 'ok' })
    try {
      while (!closed) {
        if (pending) {
          pending = false
          await stream.writeSSE({ event: 'config', data: String(Date.now()) })
        }
        await stream.sleep(1000) // poll the change flag + act as heartbeat
      }
    } finally {
      configEvents.off('change', onChange)
    }
  }),
)

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
    if (body.hiddenEntities !== undefined) store.config.hiddenEntities = body.hiddenEntities
    if (body.deviceOverrides !== undefined) store.config.deviceOverrides = body.deviceOverrides
    if (body.forceCelsius !== undefined) store.config.forceCelsius = body.forceCelsius
    if (body.advancedMode !== undefined) store.config.advancedMode = body.advancedMode
    if (body.doorbell !== undefined) store.config.doorbell = body.doorbell
    if (body.doorbells !== undefined) store.config.doorbells = body.doorbells
    if (body.groups !== undefined) store.config.groups = body.groups
    if (body.home !== undefined) {
      store.config.home = {
        ...(store.config.home ?? { widgets: [] }),
        ...body.home,
      }
    }
    if (body.dashboardLayout !== undefined) store.config.dashboardLayout = body.dashboardLayout
  })
  if (!ok) return c.json({ error: 'Configuration could not be saved' }, 500)
  emitConfigChange() // notify all connected clients to refetch
  return c.json({ ok: true })
})
