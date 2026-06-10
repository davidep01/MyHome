import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/client.js'
import type { AppConfig, DbStore } from '../db/types.js'
import { getHAConfig } from '../lib/ha-config.js'
import { configEvents, emitConfigChange } from '../lib/configEvents.js'
import { desktopOnly } from '../lib/security.js'
import { mergeHomeConfig, normalizeHomeConfig } from '../lib/home-layout.js'

export const configRouter = new Hono()

configRouter.use('*', desktopOnly)

// Live config stream — every client subscribes and refetches on a change, so a
// global dashboard edit on one device propagates to all devices instantly.
// Event-driven (no polling): a change wakes the waiter and is pushed immediately.
configRouter.get('/stream', (c) => {
  // Prevent any intermediary (WebView/proxy) from buffering the event stream.
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('X-Accel-Buffering', 'no')
  return streamSSE(c, async (stream) => {
    let closed = false
    let dirty = false
    let wake: (() => void) | null = null
    const onChange = () => { dirty = true; wake?.() }
    configEvents.on('change', onChange)
    stream.onAbort(() => { closed = true; wake?.() })

    await stream.writeSSE({ event: 'ready', data: 'ok' })
    try {
      while (!closed) {
        if (dirty) {
          dirty = false
          await stream.writeSSE({ event: 'config', data: String(Date.now()) })
          continue
        }
        // Sleep until a change wakes us, with a 25s heartbeat to keep the
        // connection (and any proxy) alive.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 25_000)
          wake = () => { clearTimeout(t); wake = null; resolve() }
        })
        if (!closed && !dirty) await stream.writeSSE({ event: 'ping', data: '' })
      }
    } finally {
      configEvents.off('change', onChange)
    }
  })
})

configRouter.get('/', async (c) => {
  const { config } = await db.read()
  const ha = await getHAConfig()
  // Never return the HA token in plaintext — mask it
  return c.json({
    ...config,
    home: normalizeHomeConfig(config.home),
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

// Full backup of the single-document store (config + rooms + entities).
// Token included on purpose: a restore must be complete, and this route is
// desktop-only.
configRouter.get('/export', async (c) => {
  const store = await db.read()
  const stamp = new Date().toISOString().slice(0, 10)
  c.header('Content-Disposition', `attachment; filename="myhome-backup-${stamp}.json"`)
  return c.json({ version: 1, exportedAt: new Date().toISOString(), store })
})

// Restore a backup produced by /export. Replaces the whole document; the home
// layout is re-normalized so a hand-edited or stale file can't corrupt the grid.
configRouter.post('/import', async (c) => {
  const body = await c.req.json<{ version?: number; store?: Partial<DbStore> }>().catch(() => null)
  const incoming = body?.store
  if (!incoming || typeof incoming !== 'object' || !incoming.config || typeof incoming.config !== 'object') {
    return c.json({ error: 'Backup non valido: atteso { store: { config, rooms, entities } }' }, 400)
  }
  const ok = await db.write((store) => {
    store.config = {
      ...incoming.config as AppConfig,
      home: mergeHomeConfig(store.config.home, normalizeHomeConfig((incoming.config as AppConfig).home), 'desktop'),
    }
    if (Array.isArray(incoming.rooms)) store.rooms = incoming.rooms
    if (Array.isArray(incoming.entities)) store.entities = incoming.entities
  })
  if (!ok) return c.json({ error: 'Configurazione in sola lettura in questo deployment' }, 409)
  emitConfigChange()
  return c.json({ ok: true })
})

configRouter.put('/', async (c) => {
  const body = await c.req.json<Partial<AppConfig>>()
  const ha = await getHAConfig()

  // Optimistic concurrency for the home layout. Desktop (this route) and kiosk
  // (/api/layout) both coordinate through config.home.layoutVersion, so a stale
  // save from one device can no longer silently clobber the other — it 409s and
  // the client refetches the current layout. Only enforced when the client sends
  // a layoutVersion (i.e. a home edit); other config writes are unaffected.
  if (body.home !== undefined && Number.isInteger(body.home.layoutVersion)) {
    const { config } = await db.read()
    const currentVersion = normalizeHomeConfig(config.home).layoutVersion ?? 1
    if (body.home.layoutVersion !== currentVersion) {
      return c.json({ error: 'Layout modificato da un altro dispositivo', currentVersion }, 409)
    }
  }

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
      store.config.home = mergeHomeConfig(store.config.home, body.home, 'desktop')
    }
    if (body.dashboardLayout !== undefined) store.config.dashboardLayout = body.dashboardLayout
  })
  if (!ok) return c.json({ error: 'Configuration could not be saved' }, 500)
  emitConfigChange() // notify all connected clients to refetch
  return c.json({ ok: true })
})
