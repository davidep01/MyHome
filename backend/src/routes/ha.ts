import { Hono } from 'hono'
import { getHABaseUrl, getHAConfig } from '../lib/ha-config.js'

export const haRouter = new Hono()

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
  const body = await c.req.text()
  const res = await proxyHA(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
    method: 'POST',
    body: body || '{}',
  })
  return forwardResponse(res)
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

haRouter.get('/media', async (c) => {
  const path = c.req.query('path')
  if (!path || !path.startsWith('/')) {
    return c.json({ error: 'Invalid media path' }, 400)
  }
  const res = await proxyHA(path)
  return forwardResponse(res)
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
