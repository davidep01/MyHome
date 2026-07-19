import type { Layout, LayoutItem } from 'react-grid-layout/legacy'
import type { DashboardPosition, HomeWidget, WidgetSize } from '../api/backend'

/**
 * Single source of truth for the home-widget grid on the frontend.
 *
 * The SAME geometry + bin-packing also lives, authoritatively, in
 * `backend/src/lib/home-layout.ts` (server-side validation/normalisation).
 * Keep the two in sync: COLS, ROW_HEIGHT and SIZE_WH MUST match the backend's
 * HOME_COLS / HOME_ROW_HEIGHT / HOME_SIZE_WH. This module replaces the three
 * previous copies that lived inside WidgetHome.tsx, KioskWidgetHome.tsx and
 * widgetCatalog.ts.
 */
export const HOME_COLS = 3
export const HOME_ROW_HEIGHT = 38

/**
 * Tre slot logici per riga e sei sotto-righe verticali. Le taglie esistenti
 * conservano le loro altezze; XS è alta 90 px e tre XS impilate, inclusi i
 * gap, coincidono esattamente con una L da 298 px.
 */
export const SIZE_WH: Record<WidgetSize, { w: number; h: number }> = {
  xs: { w: 1, h: 2 },
  sm: { w: 1, h: 3 },
  md: { w: 2, h: 3 },
  lg: { w: 3, h: 6 },
  wide: { w: 3, h: 3 },
}

export type HomePositions = Record<string, DashboardPosition>

export function widgetLayoutItem(widget: HomeWidget, pos?: Partial<DashboardPosition>): LayoutItem {
  const wh = SIZE_WH[widget.size]
  return {
    i: widget.id,
    x: Math.max(0, Math.min(pos?.x ?? 0, HOME_COLS - wh.w)),
    y: Math.max(0, pos?.y ?? 0),
    w: wh.w,
    h: wh.h,
  }
}

function cellsFor(item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): string[] {
  const cells: string[] = []
  for (let y = item.y; y < item.y + item.h; y += 1) {
    for (let x = item.x; x < item.x + item.w; x += 1) cells.push(`${x}:${y}`)
  }
  return cells
}

function fits(occupied: Set<string>, item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): boolean {
  if (item.x < 0 || item.y < 0 || item.x + item.w > HOME_COLS) return false
  return cellsFor(item).every((cell) => !occupied.has(cell))
}

function occupy(occupied: Set<string>, item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>): void {
  cellsFor(item).forEach((cell) => occupied.add(cell))
}

function firstFreeSlot(occupied: Set<string>, widget: HomeWidget): { x: number; y: number } {
  const wh = SIZE_WH[widget.size]
  for (let y = 0; y < 1000; y += 1) {
    for (let x = 0; x <= HOME_COLS - wh.w; x += 1) {
      const candidate = { x, y, w: wh.w, h: wh.h }
      if (fits(occupied, candidate)) return { x, y }
    }
  }
  return { x: 0, y: 0 }
}

/**
 * Place every widget on the grid: honour saved positions when they still fit,
 * otherwise pack the rest into the first free slot. Deterministic and
 * collision-free — mirrors the backend `normalizeHomePositions`.
 */
export function buildLayout(widgets: HomeWidget[], saved: HomePositions = {}, priorityId?: string): Layout {
  const occupied = new Set<string>()
  const layout: LayoutItem[] = []
  const missing: HomeWidget[] = []
  const widgetIndex = new Map(widgets.map((widget, index) => [widget.id, index]))
  const placementOrder = [...widgets].sort((left, right) => {
    if (left.id === priorityId) return -1
    if (right.id === priorityId) return 1
    const leftPos = saved[left.id]
    const rightPos = saved[right.id]
    return (leftPos?.y ?? 0) - (rightPos?.y ?? 0)
      || (leftPos?.x ?? 0) - (rightPos?.x ?? 0)
      || (widgetIndex.get(left.id) ?? 0) - (widgetIndex.get(right.id) ?? 0)
  })

  placementOrder.forEach((widget) => {
    const item = widgetLayoutItem(widget, saved[widget.id])
    if (saved[widget.id] && fits(occupied, item)) {
      layout.push(item)
      occupy(occupied, item)
    } else {
      missing.push(widget)
    }
  })

  missing.forEach((widget) => {
    const { x, y } = firstFreeSlot(occupied, widget)
    const item = widgetLayoutItem(widget, { x, y })
    layout.push(item)
    occupy(occupied, item)
  })

  const compacted = compactVertically(layout)
  const byId = new Map(compacted.map((item) => [item.i, item]))
  return widgets.map((widget) => byId.get(widget.id)).filter(Boolean) as Layout
}

/**
 * Pull every tile upward until it touches the grid edge or another tile.
 * X never changes: the result feels magnetic without unexpectedly swapping
 * columns, and mirrors react-grid-layout's vertical compaction while dragging.
 */
export function compactVertically(layout: Layout): Layout {
  const occupied = new Set<string>()
  const compacted = new Map<string, LayoutItem>()
  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x || a.i.localeCompare(b.i))

  for (const source of ordered) {
    const item = { ...source }
    while (item.y > 0 && fits(occupied, { ...item, y: item.y - 1 })) item.y -= 1
    occupy(occupied, item)
    compacted.set(item.i, item)
  }

  return layout.map((item) => compacted.get(item.i) ?? item)
}

/**
 * Serialise a react-grid-layout `Layout` back to persisted positions. When
 * `widgets` are supplied, w/h are re-derived from SIZE_WH (the grid is the
 * source of x/y, the catalog is the source of w/h) so a stray resize can't
 * corrupt the stored footprint.
 */
export function positionsFromLayout(layout: Layout, widgets?: HomeWidget[]): HomePositions {
  const sizeById = widgets ? new Map(widgets.map((w) => [w.id, SIZE_WH[w.size]])) : null
  return layout.reduce<HomePositions>((acc, item) => {
    const wh = sizeById?.get(item.i)
    if (sizeById && !wh) return acc
    acc[item.i] = { x: item.x, y: item.y, w: wh?.w ?? item.w, h: wh?.h ?? item.h }
    return acc
  }, {})
}

/** Reading order (top-to-bottom, left-to-right) derived from a grid layout. */
export function orderFromLayout(layout: Layout): string[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((item) => item.i)
}

/** True when two layouts place every item at the same x/y/w/h. */
export function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((item) => [item.i, item]))
  return a.every((item) => {
    const other = byId.get(item.i)
    return Boolean(other) && item.x === other!.x && item.y === other!.y && item.w === other!.w && item.h === other!.h
  })
}

/** Altezza naturale della griglia in pixel, prima dell'eventuale fit kiosk. */
export function layoutPixelHeight(layout: Layout, rowHeight: number, rowGap: number): number {
  if (layout.length === 0) return 0
  const rows = Math.max(...layout.map((item) => item.y + item.h))
  const safeRowHeight = Math.max(1, rowHeight)
  const safeGap = Math.max(0, rowGap)
  return rows * safeRowHeight + Math.max(0, rows - 1) * safeGap
}
