import type { AppConfig, HomeConfig, HomeWidget, WidgetSize, WidgetType } from '../db/types.js'

export type HomePosition = { x: number; y: number; w: number; h: number }

export const HOME_SCHEMA_VERSION = 1
export const HOME_DASHBOARD_ID = 'home'
export const HOME_COLS = 8
export const HOME_ROW_HEIGHT = 64

export const HOME_SIZE_WH: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 2, h: 2 },
  md: { w: 4, h: 2 },
  lg: { w: 4, h: 4 },
  wide: { w: 8, h: 2 },
}

const DEFAULT_HOME_WIDGETS: HomeWidget[] = [
  { id: 'w-clock', type: 'clock', size: 'md' },
  { id: 'w-status', type: 'status', size: 'sm' },
  { id: 'w-weather', type: 'weather', size: 'md' },
  { id: 'w-stats', type: 'quickStats', size: 'wide' },
  { id: 'w-scenes', type: 'scenes', size: 'wide' },
]

const WIDGET_TYPES = new Set<WidgetType>([
  'clock',
  'weather',
  'quickStats',
  'scenes',
  'status',
  'entity',
  'group',
  'sensor',
  'camera',
  'people',
  'security',
  'system',
  'insight',
  'news',
  'calendar',
])

const WIDGET_SIZES = new Set<WidgetSize>(['sm', 'md', 'lg', 'wide'])
const UPDATE_CONTEXTS = new Set<NonNullable<HomeConfig['updatedBy']>>(['desktop', 'tablet', 'migration', 'system'])

export function defaultHomeWidgets(): HomeWidget[] {
  return structuredClone(DEFAULT_HOME_WIDGETS)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isWidgetType(value: unknown): value is WidgetType {
  return typeof value === 'string' && WIDGET_TYPES.has(value as WidgetType)
}

function isWidgetSize(value: unknown): value is WidgetSize {
  return typeof value === 'string' && WIDGET_SIZES.has(value as WidgetSize)
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.trim().length <= 120 ? value.trim() : undefined
}

export function sanitizeWidget(value: unknown): HomeWidget | null {
  if (!isObject(value)) return null
  const id = stringOrUndefined(value.id)
  if (!id || !isWidgetType(value.type) || !isWidgetSize(value.size)) return null

  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return null
  const widget: HomeWidget = { id, type: value.type, size: value.size }
  const entityId = stringOrUndefined(value.entityId)
  const groupId = stringOrUndefined(value.groupId)
  if (entityId && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId)) widget.entityId = entityId
  if (groupId && /^[a-z0-9][a-z0-9_-]*$/i.test(groupId)) widget.groupId = groupId
  return widget
}

export const MAX_HOME_WIDGETS = 60

/**
 * Strict parse of a client-supplied widget list (home editor add/remove/resize):
 * every entry must be valid and unique, or the whole list is rejected — a widget
 * manager must never silently drop a tile the user just placed.
 */
export function parseHomeWidgets(value: unknown): HomeWidget[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_HOME_WIDGETS) return null
  const seen = new Set<string>()
  const widgets: HomeWidget[] = []
  for (const item of value) {
    const widget = sanitizeWidget(item)
    if (!widget || seen.has(widget.id)) return null
    seen.add(widget.id)
    widgets.push(widget)
  }
  return widgets
}

function sanitizeWidgets(value: unknown, fallback: HomeWidget[]): HomeWidget[] {
  if (!Array.isArray(value)) return fallback
  const seen = new Set<string>()
  const widgets: HomeWidget[] = []

  for (const item of value.slice(0, 100)) {
    const widget = sanitizeWidget(item)
    if (!widget || seen.has(widget.id)) continue
    seen.add(widget.id)
    widgets.push(widget)
  }

  return widgets
}

function sanitizeOrder(widgets: HomeWidget[], value: unknown): string[] {
  const widgetIds = new Set(widgets.map((widget) => widget.id))
  const order: string[] = []
  const seen = new Set<string>()

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string' || !widgetIds.has(item) || seen.has(item)) continue
      seen.add(item)
      order.push(item)
    }
  }

  return [...order, ...widgets.map((widget) => widget.id).filter((id) => !seen.has(id))]
}

function orderedWidgets(widgets: HomeWidget[], order: string[]): HomeWidget[] {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]))
  return order.map((id) => byId.get(id)).filter(Boolean) as HomeWidget[]
}

function intOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function rawPosition(value: unknown): HomePosition | null {
  if (!isObject(value)) return null
  const x = intOrNull(value.x)
  const y = intOrNull(value.y)
  const w = intOrNull(value.w)
  const h = intOrNull(value.h)
  if (x === null || y === null || w === null || h === null) return null
  return { x, y, w, h }
}

function cellsFor(item: HomePosition): string[] {
  const cells: string[] = []
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) cells.push(`${x}:${y}`)
  }
  return cells
}

function fits(occupied: Set<string>, item: HomePosition): boolean {
  if (item.x < 0 || item.y < 0 || item.x + item.w > HOME_COLS) return false
  return cellsFor(item).every((cell) => !occupied.has(cell))
}

function occupy(occupied: Set<string>, item: HomePosition): void {
  cellsFor(item).forEach((cell) => occupied.add(cell))
}

function positionFor(widget: HomeWidget, raw?: HomePosition | null): HomePosition {
  const wh = HOME_SIZE_WH[widget.size]
  return {
    x: Math.max(0, Math.min(raw?.x ?? 0, HOME_COLS - wh.w)),
    y: Math.max(0, Math.min(raw?.y ?? 0, 1_000)),
    w: wh.w,
    h: wh.h,
  }
}

function firstFreeSlot(occupied: Set<string>, widget: HomeWidget): Pick<HomePosition, 'x' | 'y'> {
  const wh = HOME_SIZE_WH[widget.size]
  for (let y = 0; y < 1000; y += 1) {
    for (let x = 0; x <= HOME_COLS - wh.w; x += 1) {
      const candidate = { x, y, w: wh.w, h: wh.h }
      if (fits(occupied, candidate)) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

function rawPositions(value: unknown): Record<string, HomePosition> {
  if (!isObject(value)) return {}
  return Object.entries(value).slice(0, 200).reduce<Record<string, HomePosition>>((acc, [id, item]) => {
    const pos = rawPosition(item)
    if (pos) acc[id] = pos
    return acc
  }, {})
}

export function normalizeHomePositions(
  widgets: HomeWidget[],
  value: unknown,
): Record<string, HomePosition> {
  const saved = rawPositions(value)
  const occupied = new Set<string>()
  const positions: Record<string, HomePosition> = {}
  const missing: HomeWidget[] = []

  for (const widget of widgets) {
    const item = positionFor(widget, saved[widget.id])
    if (saved[widget.id] && fits(occupied, item)) {
      positions[widget.id] = item
      occupy(occupied, item)
    } else {
      missing.push(widget)
    }
  }

  for (const widget of missing) {
    const { x, y } = firstFreeSlot(occupied, widget)
    const item = positionFor(widget, { x, y, ...HOME_SIZE_WH[widget.size] })
    positions[widget.id] = item
    occupy(occupied, item)
  }

  return positions
}

function cleanLayoutVersion(value: unknown, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function cleanUpdatedAt(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : fallback
}

function cleanUpdatedBy(value: unknown, fallback: NonNullable<HomeConfig['updatedBy']>): NonNullable<HomeConfig['updatedBy']> {
  return UPDATE_CONTEXTS.has(value as NonNullable<HomeConfig['updatedBy']>)
    ? value as NonNullable<HomeConfig['updatedBy']>
    : fallback
}

export function normalizeHomeConfig(home?: HomeConfig): HomeConfig {
  const widgets = sanitizeWidgets(home?.widgets, defaultHomeWidgets())
  const order = sanitizeOrder(widgets, home?.order)
  const ordered = orderedWidgets(widgets, order)
  const positions = normalizeHomePositions(ordered, home?.positions)

  return {
    widgets: ordered,
    positions,
    order: ordered.map((widget) => widget.id),
    layoutVersion: cleanLayoutVersion(home?.layoutVersion, 1),
    updatedAt: cleanUpdatedAt(home?.updatedAt, new Date(0).toISOString()),
    updatedBy: cleanUpdatedBy(home?.updatedBy, 'migration'),
    ...(home?.lastValidPositions
      ? { lastValidPositions: normalizeHomePositions(ordered, home.lastValidPositions) }
      : {}),
  }
}

export function mergeHomeConfig(
  current: HomeConfig | undefined,
  patch: Partial<HomeConfig>,
  updatedBy: NonNullable<HomeConfig['updatedBy']>,
): HomeConfig {
  const base = normalizeHomeConfig(current)
  const next = normalizeHomeConfig({
    ...base,
    ...patch,
    widgets: patch.widgets ?? base.widgets,
  })
  const requestedVersion = Number.isInteger(patch.layoutVersion) ? Number(patch.layoutVersion) : null
  const nextVersion = requestedVersion && requestedVersion > (base.layoutVersion ?? 1)
    ? requestedVersion
    : (base.layoutVersion ?? 1) + 1

  return {
    ...next,
    layoutVersion: nextVersion,
    updatedAt: typeof patch.updatedAt === 'string' && patch.updatedAt.trim()
      ? patch.updatedAt
      : new Date().toISOString(),
    updatedBy,
    lastValidPositions: base.positions,
  }
}

export function tabletHomeLayout(config: AppConfig) {
  const home = normalizeHomeConfig(config.home)

  return {
    schemaVersion: HOME_SCHEMA_VERSION,
    dashboardId: HOME_DASHBOARD_ID,
    widgets: home.widgets,
    layout: {
      cols: HOME_COLS,
      rowHeight: HOME_ROW_HEIGHT,
      items: home.positions ?? {},
      order: home.order ?? home.widgets.map((widget) => widget.id),
    },
    layoutVersion: home.layoutVersion ?? 1,
    updatedAt: home.updatedAt ?? new Date(0).toISOString(),
    updatedBy: home.updatedBy ?? 'migration',
    userName: config.userName,
    dashboardName: config.dashboardName,
    groups: config.groups ?? [],
    doorbells: config.doorbells ?? [],
    deviceOverrides: config.deviceOverrides ?? {},
    // Curation data the kiosk needs to filter discovery (not secret).
    hiddenEntities: config.hiddenEntities ?? [],
    kiosk: config.kiosk ?? {},
    // Modalità allarme: il kiosk deve conoscere foto opt-in e pulsanti emergenza.
    alarm: config.alarm ?? {},
    // Privacy-sensitive cloud processing is explicit opt-in.
    ai: { doorbellVision: config.ai?.doorbellVision === true },
    source: 'backend' as const,
  }
}
