import type { TabletDashboardLayout } from '../api/backend'
import { HOME_COLS, HOME_ROW_HEIGHT, HOME_SIZE_WH, parseHomeWidgets } from '../../backend/src/lib/home-layout'
import { validateConfigPatch } from '../../backend/src/lib/config-validation'

const CACHE_PREFIX = 'myhome.kiosk.layout.'
let epoch = 0
let acceptedGeneration: string | null = null
export function syncLayoutCacheGeneration(generation: string): void {
  if (acceptedGeneration === generation) return
  acceptedGeneration = generation
  try {
    const previous = window.localStorage.getItem(`${CACHE_PREFIX}generation`)
    if (previous && previous !== generation) clearTabletLayoutCache()
    window.localStorage.setItem(`${CACHE_PREFIX}generation`, generation)
  } catch { /* optional persistence */ }
}
export function layoutCacheEpoch() { return epoch }

/** Revoke persisted data as well as late in-flight writes on logout/401/403. */
export function clearTabletLayoutCache(): void {
  epoch += 1
  try {
    const storage = window.localStorage
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key)
  } catch { /* storage may be blocked; epoch still revokes in-flight writes */ }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateCachedLayout(value: unknown, dashboardId: string): value is TabletDashboardLayout {
  if (!record(value) || typeof value.haGeneration !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.haGeneration) || value.schemaVersion !== 3 || value.dashboardId !== dashboardId
    || !Number.isSafeInteger(value.layoutVersion) || Number(value.layoutVersion) < 1
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || !['desktop', 'tablet', 'migration', 'system'].includes(String(value.updatedBy))
    || typeof value.userName !== 'string' || typeof value.dashboardName !== 'string') return false
  const widgets = parseHomeWidgets(value.widgets)
  if (!widgets || !record(value.layout)) return false
  const layout = value.layout
  if (layout.cols !== HOME_COLS || layout.rowHeight !== HOME_ROW_HEIGHT || !record(layout.items)
    || !Array.isArray(layout.order) || layout.order.length !== widgets.length) return false
  const ids = new Set(widgets.map((widget) => widget.id))
  if (new Set(layout.order).size !== ids.size || layout.order.some((id) => typeof id !== 'string' || !ids.has(id))) return false
  if (Object.keys(layout.items).length !== widgets.length) return false
  const occupied = new Set<string>()
  for (const widget of widgets) {
    const position = layout.items[widget.id]
    const size = HOME_SIZE_WH[widget.size]
    if (!record(position) || !Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.y)
      || Number(position.x) < 0 || Number(position.y) < 0 || Number(position.y) > 10000
      || position.w !== size.w || position.h !== size.h || Number(position.x) + size.w > HOME_COLS) return false
    for (let x = Number(position.x); x < Number(position.x) + size.w; x++) {
      for (let y = Number(position.y); y < Number(position.y) + size.h; y++) {
        const key = `${x}:${y}`
        if (occupied.has(key)) return false
        occupied.add(key)
      }
    }
  }
  if (!Array.isArray(value.groups) || !Array.isArray(value.doorbells) || !record(value.deviceOverrides)) return false
  return validateConfigPatch({
    solarProductionEntityId: value.solarProductionEntityId,
    groups: value.groups, doorbells: value.doorbells, deviceOverrides: value.deviceOverrides,
    hiddenEntities: value.hiddenEntities, kiosk: value.kiosk, alarm: value.alarm, ai: value.ai,
  }).ok
}

export function readCachedLayout(dashboardId: string): TabletDashboardLayout | null {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${dashboardId}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!validateCachedLayout(parsed, dashboardId) || (acceptedGeneration && parsed.haGeneration !== acceptedGeneration)) {
      window.localStorage.removeItem(`${CACHE_PREFIX}${dashboardId}`)
      return null
    }
    return { ...parsed, source: 'cache' }
  } catch { return null }
}
export function writeCachedLayout(dashboardId: string, layout: TabletDashboardLayout, expectedEpoch = epoch): void {
  if (expectedEpoch !== epoch || !validateCachedLayout(layout, dashboardId)
    || (acceptedGeneration && layout.haGeneration !== acceptedGeneration)) return
  try { window.localStorage.setItem(`${CACHE_PREFIX}${dashboardId}`, JSON.stringify(layout)) } catch { /* optional */ }
}

export function temporaryLayoutFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if ('status' in error) return typeof error.status === 'number' && error.status >= 500
  return error instanceof TypeError || error.name === 'AbortError' || error.name === 'TimeoutError'
    || error.message === 'La richiesta non ha risposto in tempo'
}
