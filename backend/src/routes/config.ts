import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/client.js'
import type { DbStore } from '../db/types.js'
import { getHAConfig, normalizeHAUrl } from '../lib/ha-config.js'
import { configEvents, emitConfigChange } from '../lib/configEvents.js'
import { desktopOnly } from '../lib/security.js'
import { mergeHomeConfig, normalizeHomeConfig } from '../lib/home-layout.js'
import { validateConfigPatch } from '../lib/config-validation.js'
import { cleanText, integerInRange, isEntityId, isEntityType, isIconName, isRecord, SIMPLE_ID_PATTERN } from '../lib/validation.js'
import { invalidateHAConnection } from '../lib/ha-stream.js'
import { invalidateHARegistryCache } from '../lib/ha-registry-cache.js'

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

// Portable backup of user-facing configuration. Secrets are deliberately
// redacted: a downloaded JSON file must never become an HA access credential.
configRouter.get('/export', async (c) => {
  const current = await db.read()
  const store: DbStore = {
    ...current,
    config: {
      ...current.config,
      haToken: current.config.haToken ? '***' : '',
    },
  }
  const stamp = new Date().toISOString().slice(0, 10)
  c.header('Content-Disposition', `attachment; filename="myhome-backup-${stamp}.json"`)
  return c.json({ version: 2, exportedAt: new Date().toISOString(), secretsIncluded: false, store })
})

// Restore a backup produced by /export. Replaces the whole document; the home
// layout is re-normalized so a hand-edited or stale file can't corrupt the grid.
configRouter.post('/import', async (c) => {
  const body = await c.req.json<{ version?: number; store?: Partial<DbStore> }>().catch(() => null)
  const incoming = body?.store
  if (!body || (body.version !== 1 && body.version !== 2) || !incoming || typeof incoming !== 'object' || !incoming.config || typeof incoming.config !== 'object') {
    return c.json({ error: 'Backup non valido: atteso { store: { config, rooms, entities } }' }, 400)
  }
  const configResult = validateConfigPatch(incoming.config)
  if (!configResult.ok) return c.json({ error: `Backup non valido: ${configResult.error}` }, 400)

  const rooms = incoming.rooms
  if (!Array.isArray(rooms) || rooms.length > 200) return c.json({ error: 'Elenco stanze del backup non valido' }, 400)
  const roomIds = new Set<string>()
  const normalizedRooms: DbStore['rooms'] = []
  for (const room of rooms) {
    if (!isRecord(room) || Object.keys(room).some((key) => !['id', 'label', 'icon', 'sortOrder'].includes(key))) {
      return c.json({ error: 'Elenco stanze del backup non valido' }, 400)
    }
    const label = cleanText(room.label, 80)
    if (typeof room.id !== 'string' || !SIMPLE_ID_PATTERN.test(room.id) || roomIds.has(room.id)
      || !label || !isIconName(room.icon) || !integerInRange(room.sortOrder, 0, 10_000)) {
      return c.json({ error: 'Elenco stanze del backup non valido' }, 400)
    }
    roomIds.add(room.id)
    normalizedRooms.push({ id: room.id, label, icon: room.icon, sortOrder: room.sortOrder })
  }
  const entities = incoming.entities
  if (!Array.isArray(entities) || entities.length > 5_000) return c.json({ error: 'Elenco entità del backup non valido' }, 400)
  const entityKeys = new Set<string>()
  const normalizedEntities: DbStore['entities'] = []
  for (const entity of entities) {
    if (!isRecord(entity) || Object.keys(entity).some((key) => !['id', 'roomId', 'entityId', 'label', 'type', 'sortOrder', 'favorite'].includes(key))) {
      return c.json({ error: 'Elenco entità del backup non valido' }, 400)
    }
    const label = cleanText(entity.label, 100)
    if (typeof entity.id !== 'string' || !/^[a-z0-9_.-]{1,255}$/i.test(entity.id) || entityKeys.has(entity.id)
      || typeof entity.roomId !== 'string' || !roomIds.has(entity.roomId) || !isEntityId(entity.entityId)
      || !label || !isEntityType(entity.type) || !integerInRange(entity.sortOrder, 0, 10_000)
      || (entity.favorite !== undefined && typeof entity.favorite !== 'boolean')) {
      return c.json({ error: 'Elenco entità del backup non valido' }, 400)
    }
    entityKeys.add(entity.id)
    normalizedEntities.push({
      id: entity.id,
      roomId: entity.roomId,
      entityId: entity.entityId,
      label,
      type: entity.type,
      sortOrder: entity.sortOrder,
      ...(typeof entity.favorite === 'boolean' ? { favorite: entity.favorite } : {}),
    })
  }

  const ok = await db.write((store) => {
    const importedConfig = configResult.value
    store.config = {
      ...store.config,
      ...importedConfig,
      // Connection credentials are installation-local and never restored from
      // portable backups, including legacy v1 exports.
      haUrl: store.config.haUrl,
      haToken: store.config.haToken,
      home: mergeHomeConfig(store.config.home, normalizeHomeConfig(importedConfig.home), 'desktop'),
    }
    store.rooms = normalizedRooms
    store.entities = normalizedEntities
  })
  if (!ok) return c.json({ error: 'Configurazione in sola lettura in questo deployment' }, 409)
  emitConfigChange()
  return c.json({ ok: true })
})

configRouter.put('/', async (c) => {
  const input = await c.req.json<unknown>().catch(() => null)
  const validation = validateConfigPatch(input)
  if (!validation.ok) return c.json({ error: validation.error }, 400)
  const body = validation.value
  const requestedLayoutVersion = isRecord(input)
    && isRecord(input.home)
    && Number.isSafeInteger(input.home.layoutVersion)
    ? Number(input.home.layoutVersion)
    : null
  if (body.home !== undefined && requestedLayoutVersion === null) {
    return c.json({ error: 'layoutVersion è obbligatorio quando si modifica la home' }, 400)
  }
  const ha = await getHAConfig()

  const normalizedHAUrl = body.haUrl === undefined ? undefined : normalizeHAUrl(body.haUrl)
  if (body.haUrl !== undefined && !normalizedHAUrl) {
    return c.json({ error: 'Usa un URL Home Assistant valido nella rete locale (http/https).' }, 400)
  }
  const safeHAUrl = normalizedHAUrl ?? undefined
  if (body.haToken !== undefined && (typeof body.haToken !== 'string' || body.haToken.length > 8_192)) {
    return c.json({ error: 'Token Home Assistant non valido' }, 400)
  }

  // Optimistic concurrency for the home layout. Desktop (this route) and kiosk
  // (/api/layout) both coordinate through config.home.layoutVersion, so a stale
  // save from one device can no longer silently clobber the other — it 409s and
  // the client refetches the current layout. Only enforced when the client sends
  // a layoutVersion (i.e. a home edit); other config writes are unaffected.
  if (body.home !== undefined && requestedLayoutVersion !== null) {
    const { config } = await db.read()
    const currentVersion = normalizeHomeConfig(config.home).layoutVersion ?? 1
    if (requestedLayoutVersion !== currentVersion) {
      return c.json({ error: 'Layout modificato da un altro dispositivo', currentVersion }, 409)
    }
  }

  let atomicConflictVersion: number | null = null
  let haConnectionChanged = false
  const ok = await db.write((store) => {
    // Repeat the compare-and-swap inside the serialized DB queue. The early
    // check above gives fast feedback, while this one prevents two requests
    // that both observed the same version from being committed in sequence.
    if (body.home !== undefined && requestedLayoutVersion !== null) {
      const currentVersion = normalizeHomeConfig(store.config.home).layoutVersion ?? 1
      if (requestedLayoutVersion !== currentVersion) {
        atomicConflictVersion = currentVersion
        return
      }
    }
    if (safeHAUrl !== undefined && !ha.locked.haUrl && store.config.haUrl !== safeHAUrl) {
      store.config.haUrl = safeHAUrl
      haConnectionChanged = true
    }
    if (body.haToken !== undefined && body.haToken !== '***' && !ha.locked.haToken && store.config.haToken !== body.haToken) {
      store.config.haToken = body.haToken
      haConnectionChanged = true
    }
    if (body.weatherCity !== undefined) store.config.weatherCity = body.weatherCity
    if (body.newsCategory !== undefined) store.config.newsCategory = body.newsCategory
    if (body.newsFeedUrl !== undefined) store.config.newsFeedUrl = body.newsFeedUrl
    if (body.calendarFeedUrl !== undefined) store.config.calendarFeedUrl = body.calendarFeedUrl
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
    if (body.kiosk !== undefined) store.config.kiosk = body.kiosk
    if (body.ai !== undefined) store.config.ai = body.ai
  })
  if (!ok) return c.json({ error: 'Configurazione in sola lettura in questo deployment' }, 409)
  if (atomicConflictVersion !== null) {
    return c.json({ error: 'Layout modificato da un altro dispositivo', currentVersion: atomicConflictVersion }, 409)
  }
  if (haConnectionChanged) {
    invalidateHARegistryCache()
    invalidateHAConnection()
  }
  emitConfigChange() // notify all connected clients to refetch
  return c.json({ ok: true })
})
