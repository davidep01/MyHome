import { Hono } from 'hono'
import { db } from '../db/client.js'
import type { AppConfig, HomeWidget, WidgetSize } from '../db/types.js'
import { emitConfigChange } from '../lib/configEvents.js'

export const layoutRouter = new Hono()

type Position = { x: number; y: number; w: number; h: number }

const SCHEMA_VERSION = 1
const DASHBOARD_ID = 'home'
const COLS = 8
const ROW_HEIGHT = 64
const SIZE_WH: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 2, h: 2 },
  md: { w: 4, h: 2 },
  lg: { w: 4, h: 4 },
  wide: { w: 8, h: 2 },
}

function defaultWidgets(): HomeWidget[] {
  return [
    { id: 'w-clock', type: 'clock', size: 'md' },
    { id: 'w-status', type: 'status', size: 'sm' },
    { id: 'w-weather', type: 'weather', size: 'md' },
    { id: 'w-stats', type: 'quickStats', size: 'wide' },
    { id: 'w-scenes', type: 'scenes', size: 'wide' },
  ]
}

function orderedWidgets(widgets: HomeWidget[], order?: string[]): HomeWidget[] {
  if (!order?.length) return widgets
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as HomeWidget[]
  const seen = new Set(ordered.map((widget) => widget.id))
  return [...ordered, ...widgets.filter((widget) => !seen.has(widget.id))]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function int(value: unknown): number | null {
  return Number.isInteger(value) ? value as number : null
}

function positionFor(widget: HomeWidget, raw?: Position): Position {
  const wh = SIZE_WH[widget.size]
  return {
    x: Math.max(0, Math.min(raw?.x ?? 0, COLS - wh.w)),
    y: Math.max(0, raw?.y ?? 0),
    w: wh.w,
    h: wh.h,
  }
}

function normalizedPositions(widgets: HomeWidget[], raw: Record<string, Position> = {}): Record<string, Position> {
  const result: Record<string, Position> = {}
  for (const widget of widgets) result[widget.id] = positionFor(widget, raw[widget.id])
  return result
}

function publicLayout(config: AppConfig) {
  const home = config.home ?? { widgets: defaultWidgets() }
  const widgets = orderedWidgets(home.widgets?.length ? home.widgets : defaultWidgets(), home.order)
  const positions = normalizedPositions(widgets, home.positions)
  const order = widgets.map((widget) => widget.id)

  return {
    schemaVersion: SCHEMA_VERSION as const,
    dashboardId: DASHBOARD_ID,
    widgets,
    layout: {
      cols: COLS,
      rowHeight: ROW_HEIGHT,
      items: positions,
      order,
    },
    layoutVersion: home.layoutVersion ?? 1,
    updatedAt: home.updatedAt ?? new Date(0).toISOString(),
    updatedBy: home.updatedBy ?? 'migration',
    userName: config.userName,
    dashboardName: config.dashboardName,
    groups: config.groups ?? [],
    doorbells: config.doorbells ?? [],
    deviceOverrides: config.deviceOverrides ?? {},
    source: 'backend' as const,
  }
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
  const nextItems: Record<string, Position> = {}
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
    const wh = SIZE_WH[widget.size]
    if (x === null || y === null || w === null || h === null) {
      return { ok: false as const, error: `Coordinate non valide: ${id}` }
    }
    if (x < 0 || y < 0 || x + wh.w > COLS || w !== wh.w || h !== wh.h) {
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

  return { ok: true as const, items: normalizedPositions(widgets, nextItems), order }
}

layoutRouter.get('/:dashboardId', async (c) => {
  const dashboardId = c.req.param('dashboardId')
  if (dashboardId !== DASHBOARD_ID) return c.json({ error: 'Dashboard non trovata' }, 404)
  const { config } = await db.read()
  return c.json(publicLayout(config))
})

layoutRouter.put('/:dashboardId', async (c) => {
  const dashboardId = c.req.param('dashboardId')
  if (dashboardId !== DASHBOARD_ID) return c.json({ error: 'Dashboard non trovata' }, 404)

  const body = await c.req.json().catch(() => null)
  const { config } = await db.read()
  const current = publicLayout(config)
  const validation = validatePatch(body, current.widgets, current.layoutVersion)
  if (!validation.ok) {
    const status = validation.conflict ? 409 : 400
    return c.json({ error: validation.error, current }, status)
  }

  const now = new Date().toISOString()
  const ok = await db.write((store) => {
    const home = store.config.home ?? { widgets: defaultWidgets() }
    const previous = normalizedPositions(home.widgets, home.positions)
    store.config.home = {
      ...home,
      positions: validation.items,
      order: validation.order ?? home.order ?? current.layout.order,
      layoutVersion: current.layoutVersion + 1,
      updatedAt: now,
      updatedBy: 'tablet',
      lastValidPositions: previous,
    }
  })
  if (!ok) return c.json({ error: 'Layout non salvabile in questo deploy' }, 409)

  emitConfigChange()
  const updated = await db.read()
  return c.json(publicLayout(updated.config))
})
