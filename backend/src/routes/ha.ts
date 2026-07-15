import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'
import { adminOnly, authRole } from '../lib/security.js'
import { broadcastDoorbellTest, isKnownHAImageSource, subscribeHaStream } from '../lib/ha-stream.js'
import { haWsCommand } from '../lib/ha-ws.js'
import { normalizeHAHlsPath, normalizeHAMediaPath } from '../lib/ha-paths.js'
import { OutboundRequestError, fetchWithLimits } from '../lib/request-safety.js'
import { cacheHARegistry, getCachedHARegistry, type RegistryPayload } from '../lib/ha-registry-cache.js'
import { ByteLru } from '../lib/lru.js'
import { isCriticalAction, recordCriticalAction } from '../lib/audit-log.js'

export const haRouter = new Hono()

const SERVICE_ALLOWLIST: Record<string, Set<string>> = {
  homeassistant: new Set(['turn_on', 'turn_off', 'toggle']),
  light: new Set(['turn_on', 'turn_off', 'toggle']),
  switch: new Set(['turn_on', 'turn_off', 'toggle']),
  input_boolean: new Set(['turn_on', 'turn_off', 'toggle']),
  cover: new Set(['open_cover', 'close_cover', 'stop_cover', 'set_cover_position']),
  climate: new Set(['turn_on', 'turn_off', 'set_temperature', 'set_hvac_mode', 'set_fan_mode', 'set_swing_mode', 'set_preset_mode']),
  fan: new Set(['turn_on', 'turn_off', 'toggle', 'set_percentage', 'set_preset_mode']),
  lock: new Set(['lock', 'unlock', 'open']),
  alarm_control_panel: new Set([
    'alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_arm_vacation',
    'alarm_arm_custom_bypass', 'alarm_disarm',
  ]),
  media_player: new Set([
    'turn_on', 'turn_off', 'media_play', 'media_pause', 'media_play_pause',
    'media_previous_track', 'media_next_track', 'media_stop', 'volume_set',
    'volume_mute', 'select_source',
  ]),
  scene: new Set(['turn_on']),
  script: new Set(['turn_on']),
  button: new Set(['press']),
  input_button: new Set(['press']),
  siren: new Set(['turn_on', 'turn_off', 'toggle']),
  number: new Set(['set_value']),
  input_number: new Set(['set_value']),
  select: new Set(['select_option']),
  input_select: new Set(['select_option']),
  vacuum: new Set(['start', 'pause', 'stop', 'return_to_base', 'locate']),
  remote: new Set(['turn_on', 'turn_off', 'toggle', 'send_command']),
  valve: new Set(['open_valve', 'close_valve', 'set_valve_position', 'stop_valve']),
  water_heater: new Set(['turn_on', 'turn_off', 'set_temperature', 'set_operation_mode']),
  humidifier: new Set(['turn_on', 'turn_off', 'toggle', 'set_humidity', 'set_mode']),
  lawn_mower: new Set(['start_mowing', 'pause', 'dock']),
  automation: new Set(['turn_on', 'turn_off', 'toggle']),
  persistent_notification: new Set(['dismiss']),
}

function canCallService(role: 'admin' | 'kiosk', domain: string, service: string) {
  if (domain === 'persistent_notification' && role !== 'admin') return false
  if (!Object.hasOwn(SERVICE_ALLOWLIST, domain)) return false
  return SERVICE_ALLOWLIST[domain]?.has(service) ?? false
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/
const SAFE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])
const MAX_PROXY_IMAGE_BYTES = 5 * 1_024 * 1_024

// Cache media (§16): copertine/artwork esterni riusati da tutti i client —
// N kiosk non diventano N fetch verso l'esterno, con memoria prevedibile.
const externalImageCache = new ByteLru({ maxEntries: 120, maxTotalBytes: 24 * 1_024 * 1_024, ttlMs: 6 * 60 * 60 * 1_000 })

function validNotificationDismissPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return Object.keys(record).every((key) => key === 'notification_id')
    && typeof record.notification_id === 'string'
    && /^[a-z0-9][a-z0-9_-]{0,254}$/i.test(record.notification_id)
}

function validServicePayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (['target', 'area_id', 'device_id', 'floor_id', 'label_id', '__proto__', 'constructor', 'prototype']
    .some((key) => Object.hasOwn(record, key))) return false
  const entityIds = record.entity_id
  if (entityIds === undefined) return false
  const ids = Array.isArray(entityIds) ? entityIds : [entityIds]
  return ids.length >= 1 && ids.length <= 100 && ids.every((id) => typeof id === 'string' && ENTITY_ID.test(id))
}

async function proxyHA(path: string, init?: RequestInit) {
  const { haToken, haUrl, valid } = await getHAConfig()
  if (!valid || !haUrl) {
    return new Response(JSON.stringify({ error: 'URL Home Assistant non valido' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!haToken) {
    return new Response(JSON.stringify({ error: 'Home Assistant token missing' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch(`${haUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${haToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    return res
  } catch {
    return new Response(JSON.stringify({
      error: 'Home Assistant non raggiungibile',
    }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

function forwardResponse(res: Response) {
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': res.headers.get('Cache-Control') ?? 'no-store',
    },
  })
}

function imageContentType(response: Response): string | null {
  const value = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() ?? ''
  return SAFE_IMAGE_TYPES.has(value) ? value : null
}

function imageResponse(body: BodyInit | null, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    },
  })
}

haRouter.get('/health', async (c) => {
  const { haToken } = await getHAConfig()

  if (!haToken) {
    return c.json({ ok: false, error: 'Home Assistant token missing' }, 400)
  }

  try {
    const res = await fetch(`${await getHABaseUrl()}/api/`, {
      headers: { Authorization: `Bearer ${haToken}` },
      signal: AbortSignal.timeout(5_000),
    })
    const body = await res.text()
    return c.json({
      ok: res.ok,
      status: res.status,
      message: body.slice(0, 200),
    }, res.ok ? 200 : 502)
  } catch {
    return c.json({
      ok: false,
      error: 'Home Assistant non raggiungibile',
    }, 502)
  }
})

// Live entity stream (SSE). The backend holds ONE feed to HA (WebSocket push,
// poll as automatic fallback — see ha-stream.ts) and fans out deltas to every
// client; the HA token stays server-side. Events carry a monotonic id: an
// EventSource reconnect sends `Last-Event-ID` and resumes from the missed
// deltas instead of paying a full snapshot.
haRouter.get('/stream', (c) => {
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('X-Accel-Buffering', 'no')
  const lastEventId = Number(c.req.header('Last-Event-ID'))
  const sinceId = Number.isFinite(lastEventId) ? lastEventId : undefined
  return streamSSE(c, async (stream) => {
    let closed = false
    const queue: { data: string; id: number }[] = []
    let wake: (() => void) | null = null

    const unsubscribe = subscribeHaStream((event, id) => {
      if (queue.length >= 256) {
        // End the slow connection. EventSource reconnects with Last-Event-ID,
        // so the bounded HA replay buffer can deliver the missing deltas.
        closed = true
        wake?.()
        return
      }
      queue.push({ data: JSON.stringify(event), id })
      wake?.()
    }, sinceId)
    stream.onAbort(() => { closed = true; unsubscribe(); wake?.() })

    await stream.writeSSE({ event: 'ready', data: 'ok' })
    try {
      while (!closed) {
        const next = queue.shift()
        if (next) {
          await stream.writeSSE({ event: 'states', data: next.data, id: String(next.id) })
          continue
        }
        // Sleep until the next event, with a 20s heartbeat to keep proxies/WebViews alive.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 20_000)
          wake = () => { clearTimeout(t); wake = null; resolve() }
        })
        if (!closed && queue.length === 0) await stream.writeSSE({ event: 'ping', data: '' })
      }
    } finally {
      unsubscribe()
    }
  })
})

// ── HA registries (areas/devices/entities) — proxied over the backend WS so no
// client ever needs its own authenticated socket. Cached briefly: the registry
// changes rarely but is read by every dashboard boot.
const REGISTRY_TTL_MS = 60_000

haRouter.get('/registry', async (c) => {
  const cached = getCachedHARegistry(REGISTRY_TTL_MS)
  if (cached) return c.json(cached)
  try {
    const [areas, devices, entities] = await Promise.all([
      haWsCommand<unknown[]>({ type: 'config/area_registry/list' }),
      haWsCommand<unknown[]>({ type: 'config/device_registry/list' }),
      haWsCommand<unknown[]>({ type: 'config/entity_registry/list' }),
    ])
    const data: RegistryPayload = { areas, devices, entities }
    cacheHARegistry(data)
    return c.json(data)
  } catch {
    return c.json({ error: 'Registry Home Assistant non raggiungibile' }, 502)
  }
})

// Signed HLS playlist URL for a camera (WS `camera/stream`). The returned path
// is HA-relative; the client plays it through the same-origin /api/ha/hls proxy.
haRouter.get('/camera-hls-url/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  if (!ENTITY_ID.test(entityId) || !entityId.startsWith('camera.')) return c.json({ error: 'Videocamera non valida' }, 400)
  try {
    const result = await haWsCommand<{ url?: string }>(
      { type: 'camera/stream', entity_id: entityId, format: 'hls' },
      15_000,
    )
    if (!result?.url || result.url.length > 2_048 || !result.url.startsWith('/api/hls/') || result.url.includes('..')) {
      return c.json({ error: 'Stream HLS non disponibile' }, 502)
    }
    return c.json({ url: result.url })
  } catch {
    return c.json({ error: 'Stream HLS non disponibile' }, 502)
  }
})

haRouter.get('/states', async () => {
  const res = await proxyHA('/api/states')
  return forwardResponse(res)
})

haRouter.get('/states/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  if (!ENTITY_ID.test(entityId)) return c.json({ error: 'Entità non valida' }, 400)
  const res = await proxyHA(`/api/states/${encodeURIComponent(entityId)}`)
  return forwardResponse(res)
})

haRouter.post('/services/:domain/:service', async (c) => {
  const domain = c.req.param('domain')
  const service = c.req.param('service')
  const role = authRole(c.req.raw)
  if (!role || !canCallService(role, domain, service)) {
    return c.json({ error: 'Servizio non consentito da MyHome' }, 403)
  }
  const rawBody = await c.req.text()
  if (rawBody.length > 32_768) return c.json({ error: 'Richiesta troppo grande' }, 413)
  const parsed = (() => {
    try { return rawBody ? JSON.parse(rawBody) as unknown : {} }
    catch { return null }
  })()
  const notificationDismiss = role === 'admin' && domain === 'persistent_notification' && service === 'dismiss'
  if (notificationDismiss ? !validNotificationDismissPayload(parsed) : !validServicePayload(parsed)) {
    return c.json({ error: 'Dati servizio non validi' }, 400)
  }
  const res = await proxyHA(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: JSON.stringify(parsed),
  })
  // Log amministrativo (§3): le azioni che aprono/disarmano restano tracciate.
  if (res.ok && isCriticalAction(domain, service)) {
    const target = (parsed as Record<string, unknown>).entity_id
    const entityIds = (Array.isArray(target) ? target : [target]).filter((id): id is string => typeof id === 'string')
    recordCriticalAction(role, domain, service, entityIds)
  }
  return forwardResponse(res)
})

// Prova campanello dal pannello desktop: rimbalza sullo stream HA, così suona
// su OGNI client connesso (tablet a muro incluso) senza toccare Home Assistant.
haRouter.post('/doorbell-test', adminOnly, async (c) => {
  const body = await c.req.json<{ doorbellId?: string }>().catch(() => null)
  if (!body?.doorbellId || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(body.doorbellId)) return c.json({ error: 'doorbellId non valido' }, 400)
  broadcastDoorbellTest(body.doorbellId)
  return c.json({ ok: true })
})

haRouter.get('/camera-proxy/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  if (!ENTITY_ID.test(entityId) || !entityId.startsWith('camera.')) return c.json({ error: 'Videocamera non valida' }, 400)
  const res = await proxyHA(`/api/camera_proxy/${encodeURIComponent(entityId)}`)
  return forwardResponse(res)
})

// Live MJPEG stream (continuous multipart) — usable directly as an <img> src.
haRouter.get('/camera-stream/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  if (!ENTITY_ID.test(entityId) || !entityId.startsWith('camera.')) return c.json({ error: 'Videocamera non valida' }, 400)
  const res = await proxyHA(`/api/camera_proxy_stream/${encodeURIComponent(entityId)}`)
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'multipart/x-mixed-replace',
      'Cache-Control': 'no-store',
    },
  })
})

// HLS proxy — serves HA's /api/hls/* through the same origin so the browser's
// player (hls.js) avoids cross-origin/CORS blocks. Path is preserved so the
// playlist's relative segment URLs resolve back through this same route.
haRouter.get('/hls/:rest{.*}', async (c) => {
  const rest = normalizeHAHlsPath(c.req.param('rest'))
  if (!rest) {
    return c.json({ error: 'Percorso HLS non valido' }, 400)
  }
  const search = new URL(c.req.url).search
  const res = await proxyHA(`/api/hls/${rest}${search}`)
  return forwardResponse(res)
})

haRouter.get('/media', async (c) => {
  const path = normalizeHAMediaPath(c.req.query('path'))
  if (!path) {
    return c.json({ error: 'Percorso media non valido' }, 400)
  }
  const res = await proxyHA(path)
  return forwardResponse(res)
})

// Same-origin artwork proxy. Relative/same-HA images use the authenticated HA
// bridge; external artwork is HTTPS-only, DNS checked before every redirect,
// capped, timed out and restricted to inert raster formats. This lets CSP keep
// img-src 'self' without breaking RSS thumbnails or media-player cover art.
haRouter.get('/image', async (c) => {
  const source = c.req.query('url')
  const sourceEntityId = c.req.query('entity')
  if (!source || source.length > 2_048) return c.json({ error: 'URL immagine non valido' }, 400)
  if (sourceEntityId !== undefined && !ENTITY_ID.test(sourceEntityId)) {
    return c.json({ error: 'Entità immagine non valida' }, 400)
  }

  const ha = await getHAConfig()
  if (!ha.valid || !ha.haUrl) return c.json({ error: 'URL Home Assistant non valido' }, 503)

  let internalPath: string | null = null
  if (source.startsWith('/')) {
    internalPath = normalizeHAMediaPath(source)
    if (!internalPath) return c.json({ error: 'Percorso immagine Home Assistant non valido' }, 400)
  } else {
    try {
      const sourceUrl = new URL(source)
      if (sourceUrl.origin === new URL(ha.haUrl).origin) {
        internalPath = normalizeHAMediaPath(`${sourceUrl.pathname}${sourceUrl.search}`)
        if (!internalPath) return c.json({ error: 'Percorso immagine Home Assistant non valido' }, 400)
      }
    } catch {
      return c.json({ error: 'URL immagine non valido' }, 400)
    }
  }

  if (internalPath) {
    const response = await proxyHA(internalPath, { headers: { Accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif' } })
    const contentType = imageContentType(response)
    if (!response.ok || !contentType) {
      await response.body?.cancel().catch(() => undefined)
      return c.json({ error: 'Immagine Home Assistant non disponibile' }, 502)
    }
    return imageResponse(response.body, contentType)
  }

  // Do not expose a general-purpose authenticated URL fetcher. A public cover
  // is accepted only if it is the exact entity_picture advertised by the
  // current HA snapshot; RSS thumbnails use their own opaque-key endpoint.
  if (!isKnownHAImageSource(source)) {
    // In REST-only fallback there may be no active SSE subscriber and thus no
    // server snapshot. Revalidate the exact entity_picture against HA instead
    // of either breaking artwork or turning this route into an open proxy.
    if (!sourceEntityId) return c.json({ error: 'Immagine non associata allo stato Home Assistant' }, 403)
    const stateResponse = await proxyHA(`/api/states/${encodeURIComponent(sourceEntityId)}`)
    if (!stateResponse.ok) {
      await stateResponse.body?.cancel().catch(() => undefined)
      return c.json({ error: 'Entità immagine non disponibile' }, 403)
    }
    const currentState = await stateResponse.json().catch(() => null) as { attributes?: { entity_picture?: unknown } } | null
    if (currentState?.attributes?.entity_picture !== source) {
      return c.json({ error: 'Immagine non associata allo stato Home Assistant' }, 403)
    }
  }

  const cached = externalImageCache.get(source)
  if (cached) {
    const body = new ArrayBuffer(cached.bytes.byteLength)
    new Uint8Array(body).set(cached.bytes)
    return imageResponse(body, cached.contentType)
  }

  try {
    const { response, bytes } = await fetchWithLimits(
      source,
      { method: 'GET', headers: { Accept: 'image/jpeg,image/png,image/gif,image/webp,image/avif' } },
      {
        timeoutMs: 8_000,
        maxBytes: MAX_PROXY_IMAGE_BYTES,
        maxRedirects: 3,
        requirePublicHttps: true,
      },
    )
    const contentType = imageContentType(response)
    if (!response.ok || !contentType || bytes.byteLength === 0) {
      return c.json({ error: 'Immagine esterna non disponibile' }, 502)
    }
    externalImageCache.set(source, { bytes, contentType })
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    return imageResponse(body, contentType)
  } catch (error) {
    if (error instanceof OutboundRequestError && error.reason === 'unsafe_url') {
      return c.json({ error: 'Destinazione immagine non consentita' }, 400)
    }
    if (error instanceof OutboundRequestError && error.reason === 'timeout') {
      return c.json({ error: 'L’immagine non ha risposto in tempo' }, 504)
    }
    return c.json({ error: 'Immagine esterna non disponibile' }, 502)
  }
})

// Timeline di casa: logbook HA filtrato server-side alle classi significative
// (presenze, allarme, serrature, automazioni) — il resto è rumore per il muro.
const LOGBOOK_DOMAINS = new Set(['person', 'alarm_control_panel', 'lock', 'automation'])

haRouter.get('/logbook', async (c) => {
  const { haToken } = await getHAConfig()
  if (!haToken) return c.json({ error: 'Home Assistant token missing' }, 400)

  const hoursParam = Number(c.req.query('hours') ?? '24')
  const hours = Number.isFinite(hoursParam) ? Math.min(Math.max(hoursParam, 1), 72) : 24
  const start = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  try {
    const res = await fetch(`${await getHABaseUrl()}/api/logbook/${start}`, {
      headers: { Authorization: `Bearer ${haToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return c.json({ error: `Home Assistant logbook returned ${res.status}` }, 502)
    const parsed = await res.json() as unknown
    if (!Array.isArray(parsed)) return c.json({ error: 'Risposta logbook non valida' }, 502)
    const body = parsed as { entity_id?: string; name?: string; state?: string; when?: string; message?: string }[]
    const filtered = body
      .filter((item) => item.entity_id && LOGBOOK_DOMAINS.has(item.entity_id.split('.')[0]))
      .slice(-200)
    return c.json(filtered)
  } catch {
    return c.json({
      error: 'Logbook Home Assistant non raggiungibile',
    }, 502)
  }
})

haRouter.get('/history/:entityId', async (c) => {
  const { haToken } = await getHAConfig()
  const entityId = c.req.param('entityId')
  if (!ENTITY_ID.test(entityId)) return c.json({ error: 'Entità non valida' }, 400)
  const hoursParam = Number(c.req.query('hours') ?? '1')
  const hours = Number.isFinite(hoursParam) ? Math.min(Math.max(hoursParam, 1), 168) : 1

  if (!haToken) {
    return c.json({ error: 'Home Assistant token missing' }, 400)
  }

  const start = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
  const url = new URL(`${await getHABaseUrl()}/api/history/period/${start}`)
  url.searchParams.set('filter_entity_id', entityId)
  url.searchParams.set('minimal_response', 'true')

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${haToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return c.json({ error: `Home Assistant history returned ${res.status}` }, 502)
    }
    const body = await res.json() as unknown[][]
    return c.json(body[0] ?? [])
  } catch {
    return c.json({
      error: 'Cronologia Home Assistant non raggiungibile',
    }, 502)
  }
})
