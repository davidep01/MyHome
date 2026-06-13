import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'
import { clientContextFromRequest, desktopOnly } from '../lib/security.js'
import { broadcastDoorbellTest, subscribeHaStream } from '../lib/ha-stream.js'
import { haWsCommand } from '../lib/ha-ws.js'

export const haRouter = new Hono()

const TABLET_SERVICE_ALLOWLIST: Record<string, Set<string>> = {
  homeassistant: new Set(['turn_on', 'turn_off', 'toggle']),
  light: new Set(['turn_on', 'turn_off', 'toggle']),
  switch: new Set(['turn_on', 'turn_off', 'toggle']),
  input_boolean: new Set(['turn_on', 'turn_off', 'toggle']),
  cover: new Set(['open_cover', 'close_cover', 'stop_cover', 'set_cover_position']),
  climate: new Set(['turn_on', 'turn_off', 'set_temperature', 'set_hvac_mode', 'set_fan_mode', 'set_swing_mode']),
  fan: new Set(['turn_on', 'turn_off', 'toggle', 'set_percentage', 'set_preset_mode']),
  lock: new Set(['lock', 'unlock', 'open']),
  alarm_control_panel: new Set(['alarm_arm_home', 'alarm_arm_away', 'alarm_arm_night', 'alarm_disarm']),
  media_player: new Set(['turn_on', 'turn_off', 'media_play', 'media_pause', 'media_play_pause', 'volume_set', 'select_source']),
  scene: new Set(['turn_on']),
  script: new Set(['turn_on']),
  button: new Set(['press']),
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
}

function tabletCanCallService(domain: string, service: string) {
  return TABLET_SERVICE_ALLOWLIST[domain]?.has(service) ?? false
}

async function getAuthHeaders() {
  const { haToken } = await getHAConfig()
  return {
    Authorization: `Bearer ${haToken}`,
    'Content-Type': 'application/json',
  }
}

async function proxyHA(path: string, init?: RequestInit) {
  const { haToken } = await getHAConfig()
  if (!haToken) {
    return new Response(JSON.stringify({ error: 'Home Assistant token missing' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch(`${await getHABaseUrl()}${path}`, {
      ...init,
      headers: {
        ...await getAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    })
    return res
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Home Assistant unreachable',
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

haRouter.get('/health', async (c) => {
  const { haToken } = await getHAConfig()

  if (!haToken) {
    return c.json({ ok: false, error: 'Home Assistant token missing' }, 400)
  }

  try {
    const res = await fetch(`${await getHABaseUrl()}/api/`, {
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
interface RegistryPayload {
  areas: unknown[]
  devices: unknown[]
  entities: unknown[]
}
let registryCache: { at: number; data: RegistryPayload } | null = null
const REGISTRY_TTL_MS = 60_000

haRouter.get('/registry', async (c) => {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL_MS) {
    return c.json(registryCache.data)
  }
  try {
    const [areas, devices, entities] = await Promise.all([
      haWsCommand<unknown[]>({ type: 'config/area_registry/list' }),
      haWsCommand<unknown[]>({ type: 'config/device_registry/list' }),
      haWsCommand<unknown[]>({ type: 'config/entity_registry/list' }),
    ])
    registryCache = { at: Date.now(), data: { areas, devices, entities } }
    return c.json(registryCache.data)
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Home Assistant registry unreachable',
    }, 502)
  }
})

// Signed HLS playlist URL for a camera (WS `camera/stream`). The returned path
// is HA-relative; the client plays it through the same-origin /api/ha/hls proxy.
haRouter.get('/camera-hls-url/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  try {
    const result = await haWsCommand<{ url?: string }>(
      { type: 'camera/stream', entity_id: entityId, format: 'hls' },
      15_000,
    )
    if (!result?.url) return c.json({ error: 'Stream HLS non disponibile' }, 502)
    return c.json({ url: result.url })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Stream HLS non disponibile',
    }, 502)
  }
})

haRouter.get('/states', async () => {
  const res = await proxyHA('/api/states')
  return forwardResponse(res)
})

haRouter.get('/states/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  const res = await proxyHA(`/api/states/${encodeURIComponent(entityId)}`)
  return forwardResponse(res)
})

haRouter.post('/services/:domain/:service', async (c) => {
  const domain = c.req.param('domain')
  const service = c.req.param('service')
  const context = clientContextFromRequest(
    (name) => c.req.header(name) ?? undefined,
    (name) => c.req.query(name) ?? undefined,
  )
  if (context === 'tablet' && !tabletCanCallService(domain, service)) {
    return c.json({ error: 'Servizio non disponibile dal tablet' }, 403)
  }
  const body = await c.req.text()
  const res = await proxyHA(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: body || '{}',
  })
  return forwardResponse(res)
})

// Prova campanello dal pannello desktop: rimbalza sullo stream HA, così suona
// su OGNI client connesso (tablet a muro incluso) senza toccare Home Assistant.
haRouter.post('/doorbell-test', desktopOnly, async (c) => {
  const body = await c.req.json<{ doorbellId?: string }>().catch(() => null)
  if (!body?.doorbellId) return c.json({ error: 'doorbellId mancante' }, 400)
  broadcastDoorbellTest(body.doorbellId)
  return c.json({ ok: true })
})

haRouter.get('/camera-proxy/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
  const res = await proxyHA(`/api/camera_proxy/${encodeURIComponent(entityId)}`)
  return forwardResponse(res)
})

// Live MJPEG stream (continuous multipart) — usable directly as an <img> src.
haRouter.get('/camera-stream/:entityId', async (c) => {
  const entityId = c.req.param('entityId')
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
  const rest = c.req.param('rest')
  const search = new URL(c.req.url).search
  const res = await proxyHA(`/api/hls/${rest}${search}`)
  return forwardResponse(res)
})

haRouter.get('/media', async (c) => {
  const path = c.req.query('path')
  if (!path || !path.startsWith('/')) {
    return c.json({ error: 'Invalid media path' }, 400)
  }
  const res = await proxyHA(path)
  return forwardResponse(res)
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
    })
    if (!res.ok) return c.json({ error: `Home Assistant logbook returned ${res.status}` }, 502)
    const body = await res.json() as { entity_id?: string; name?: string; state?: string; when?: string; message?: string }[]
    const filtered = body
      .filter((item) => item.entity_id && LOGBOOK_DOMAINS.has(item.entity_id.split('.')[0]))
      .slice(-200)
    return c.json(filtered)
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Home Assistant logbook unreachable',
    }, 502)
  }
})

haRouter.get('/history/:entityId', async (c) => {
  const { haToken } = await getHAConfig()
  const entityId = c.req.param('entityId')
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
    })
    if (!res.ok) {
      return c.json({ error: `Home Assistant history returned ${res.status}` }, 502)
    }
    const body = await res.json() as unknown[][]
    return c.json(body[0] ?? [])
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Home Assistant history unreachable',
    }, 502)
  }
})
