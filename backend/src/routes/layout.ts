import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { HomeWidget } from '../db/types.js'
import { emitConfigChange } from '../lib/configEvents.js'
import { adminOnly } from '../lib/security.js'
import {
  HOME_COLS,
  HOME_DASHBOARD_ID,
  HOME_SIZE_WH,
  mergeHomeConfig,
  normalizeHomePositions,
  tabletHomeLayout,
  type HomePosition,
} from '../lib/home-layout.js'

export const layoutRouter = new Hono()

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function int(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null
}

function validatePatch(body: unknown, widgets: HomeWidget[], currentVersion: number) {
  if (!isObject(body)) return { ok: false as const, error: 'Payload non valido' }

  const allowedTopLevel = new Set(['layoutVersion', 'items', 'order'])
  const forbiddenTopLevel = Object.keys(body).filter((key) => !allowedTopLevel.has(key))
  if (forbiddenTopLevel.length) {
    return { ok: false as const, error: `Campi non consentiti: ${forbiddenTopLevel.join(', ')}` }
  }

  if (body.layoutVersion !== currentVersion) {
    return { ok: false as const, conflict: true as const, error: 'Layout modificato da un altro dispositivo' }
  }

  if (!isObject(body.items)) return { ok: false as const, error: 'items mancante o non valido' }

  const widgetById = new Map(widgets.map((widget) => [widget.id, widget]))
  const nextItems: Record<string, HomePosition> = {}
  for (const [id, value] of Object.entries(body.items)) {
    const widget = widgetById.get(id)
    if (!widget) return { ok: false as const, error: `Widget non consentito: ${id}` }
    if (!isObject(value)) return { ok: false as const, error: `Posizione non valida: ${id}` }

    const keys = Object.keys(value)
    const badKeys = keys.filter((key) => !['x', 'y', 'w', 'h'].includes(key))
    if (badKeys.length) return { ok: false as const, error: `Campi posizione non consentiti su ${id}` }

    const x = int(value.x)
    const y = int(value.y)
    const w = int(value.w)
    const h = int(value.h)
    const wh = HOME_SIZE_WH[widget.size]
    if (x === null || y === null || w === null || h === null) {
      return { ok: false as const, error: `Coordinate non valide: ${id}` }
    }
    if (x < 0 || y < 0 || x + wh.w > HOME_COLS || w !== wh.w || h !== wh.h) {
      return { ok: false as const, error: `Dimensione o posizione non consentita: ${id}` }
    }
    nextItems[id] = { x, y, w, h }
  }

  let order: string[] | undefined
  if (body.order !== undefined) {
    if (!Array.isArray(body.order) || !body.order.every((id) => typeof id === 'string')) {
      return { ok: false as const, error: 'order non valido' }
    }
    const seen = new Set<string>()
    for (const id of body.order) {
      if (!widgetById.has(id)) return { ok: false as const, error: `Widget non consentito in order: ${id}` }
      if (seen.has(id)) return { ok: false as const, error: `Widget duplicato in order: ${id}` }
      seen.add(id)
    }
    order = [...body.order, ...widgets.map((widget) => widget.id).filter((id) => !seen.has(id))]
  }

  return { ok: true as const, items: normalizeHomePositions(widgets, nextItems), order }
}

layoutRouter.get('/:dashboardId', async (c) => {
  const dashboardId = c.req.param('dashboardId')
  if (dashboardId !== HOME_DASHBOARD_ID) return c.json({ error: 'Dashboard non trovata' }, 404)
  const { config } = await db.read()
  return c.json(tabletHomeLayout(config))
})

layoutRouter.put('/:dashboardId', adminOnly, async (c) => {
  const dashboardId = c.req.param('dashboardId')
  if (dashboardId !== HOME_DASHBOARD_ID) return c.json({ error: 'Dashboard non trovata' }, 404)

  const body = await c.req.json().catch(() => null)
  const { config } = await db.read()
  const current = tabletHomeLayout(config)
  const validation = validatePatch(body, current.widgets, current.layoutVersion)
  if (!validation.ok) {
    const status = validation.conflict ? 409 : 400
    return c.json({ error: validation.error, current }, status)
  }

  let atomicFailure: ReturnType<typeof validatePatch> | null = null
  let failureCurrent = current
  const ok = await db.write((store) => {
    const latest = tabletHomeLayout(store.config)
    const atomicValidation = validatePatch(body, latest.widgets, latest.layoutVersion)
    if (!atomicValidation.ok) {
      atomicFailure = atomicValidation
      failureCurrent = latest
      return
    }
    store.config.home = mergeHomeConfig(store.config.home, {
      positions: atomicValidation.items,
      order: atomicValidation.order ?? latest.layout.order,
      layoutVersion: latest.layoutVersion + 1,
    }, 'tablet')
  })
  if (!ok) return c.json({ error: 'Layout non salvabile in questo deploy' }, 409)
  if (atomicFailure) {
    const failure = atomicFailure as Exclude<ReturnType<typeof validatePatch>, { ok: true }>
    return c.json({ error: failure.error, current: failureCurrent }, 'conflict' in failure && failure.conflict ? 409 : 400)
  }

  emitConfigChange()
  const updated = await db.read()
  return c.json(tabletHomeLayout(updated.config))
})
