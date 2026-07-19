import { describe, it, expect } from 'vitest'
import type { Layout } from 'react-grid-layout/legacy'
import {
  HOME_COLS,
  SIZE_WH,
  buildLayout,
  layoutPixelHeight,
  orderFromLayout,
  positionsFromLayout,
  sameLayout,
} from './homeLayout'
import type { HomeWidget } from '../api/backend'

const widget = (id: string, size: HomeWidget['size'] = 'sm'): HomeWidget => ({ id, type: 'status', size })

/** True if any two tiles in the layout share a grid cell. */
function hasOverlap(layout: Layout): boolean {
  const occupied = new Set<string>()
  for (const item of layout) {
    for (let y = item.y; y < item.y + item.h; y += 1) {
      for (let x = item.x; x < item.x + item.w; x += 1) {
        const cell = `${x}:${y}`
        if (occupied.has(cell)) return true
        occupied.add(cell)
      }
    }
  }
  return false
}

describe('SIZE_WH', () => {
  it('matches the canonical iOS-like footprints', () => {
    expect(SIZE_WH).toEqual({
      xs: { w: 1, h: 2 },
      sm: { w: 1, h: 3 },
      md: { w: 2, h: 3 },
      lg: { w: 3, h: 6 },
      wide: { w: 3, h: 3 },
    })
  })

  it('makes three vertical XS exactly as tall as one L', () => {
    const gap = 14
    const rowHeight = 38
    const xsHeight = SIZE_WH.xs.h * rowHeight + (SIZE_WH.xs.h - 1) * gap
    const lHeight = SIZE_WH.lg.h * rowHeight + (SIZE_WH.lg.h - 1) * gap
    expect(xsHeight * 3 + gap * 2).toBe(lHeight)
    expect([xsHeight, lHeight]).toEqual([90, 298])
  })
})

describe('layoutPixelHeight', () => {
  it('calcola l altezza naturale comprese le intercapedini tra righe', () => {
    const layout: Layout = [
      { i: 'a', x: 0, y: 0, w: 2, h: 1 },
      { i: 'b', x: 0, y: 1, w: 3, h: 2 },
    ]
    expect(layoutPixelHeight(layout, 142, 14)).toBe(3 * 142 + 2 * 14)
    expect(layoutPixelHeight([], 142, 14)).toBe(0)
  })
})

describe('buildLayout', () => {
  it('packs every widget without overlap and inside the grid', () => {
    const widgets = [widget('a', 'wide'), widget('b', 'md'), widget('c', 'sm'), widget('d', 'lg'), widget('e', 'sm')]
    const layout = buildLayout(widgets)

    expect(layout).toHaveLength(widgets.length)
    expect(hasOverlap(layout)).toBe(false)
    for (const item of layout) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x + item.w).toBeLessThanOrEqual(HOME_COLS)
      expect({ w: item.w, h: item.h }).toEqual(SIZE_WH[widgets.find((w) => w.id === item.i)!.size])
    }
  })

  it('honours saved columns and magnetically removes vertical gaps', () => {
    const widgets = [widget('a'), widget('b')]
    const layout = buildLayout(widgets, { a: { x: 2, y: 8, w: 1, h: 1 }, b: { x: 0, y: 4, w: 1, h: 1 } })
    expect(layout.find((i) => i.i === 'a')).toMatchObject({ x: 2, y: 0 })
    expect(layout.find((i) => i.i === 'b')).toMatchObject({ x: 0, y: 0 })
  })

  it('relocates a widget whose saved position collides', () => {
    const widgets = [widget('a'), widget('b')]
    const layout = buildLayout(widgets, { a: { x: 0, y: 0, w: 1, h: 1 }, b: { x: 0, y: 0, w: 1, h: 1 } })
    expect(hasOverlap(layout)).toBe(false)
  })

  it('keeps a resized L tile anchored and magnetically reflows colliding neighbours', () => {
    const widgets = [widget('neighbour'), widget('resized', 'lg')]
    const layout = buildLayout(widgets, {
      neighbour: { x: 2, y: 0, w: 1, h: 1 },
      resized: { x: 0, y: 0, w: 3, h: 6 },
    }, 'resized')

    expect(layout.find((item) => item.i === 'resized')).toMatchObject({ x: 0, y: 0, w: 3, h: 6 })
    expect(layout.find((item) => item.i === 'neighbour')).not.toMatchObject({ x: 2, y: 0 })
    expect(hasOverlap(layout)).toBe(false)
  })

  it('is deterministic', () => {
    const widgets = [widget('a', 'md'), widget('b', 'sm'), widget('c', 'wide')]
    expect(buildLayout(widgets)).toEqual(buildLayout(widgets))
  })
})

describe('positionsFromLayout', () => {
  it('re-derives w/h from the widget size when widgets are supplied', () => {
    const positions = positionsFromLayout([{ i: 'a', x: 0, y: 0, w: 99, h: 99 }], [widget('a', 'md')])
    expect(positions.a).toEqual({ x: 0, y: 0, w: 2, h: 3 })
  })

  it('drops items that are not in the widget set', () => {
    const positions = positionsFromLayout([{ i: 'ghost', x: 0, y: 0, w: 2, h: 2 }], [widget('a')])
    expect(positions).toEqual({})
  })

  it('keeps the layout w/h when no widgets are supplied', () => {
    const positions = positionsFromLayout([{ i: 'a', x: 1, y: 2, w: 2, h: 2 }])
    expect(positions.a).toEqual({ x: 1, y: 2, w: 2, h: 2 })
  })
})

describe('orderFromLayout', () => {
  it('orders tiles top-to-bottom, then left-to-right', () => {
    const order = orderFromLayout([
      { i: 'a', x: 4, y: 0, w: 2, h: 2 },
      { i: 'b', x: 0, y: 0, w: 2, h: 2 },
      { i: 'c', x: 0, y: 2, w: 2, h: 2 },
    ])
    expect(order).toEqual(['b', 'a', 'c'])
  })
})

describe('sameLayout', () => {
  it('compares positions and footprints', () => {
    const base: Layout = [{ i: 'a', x: 0, y: 0, w: 2, h: 2 }]
    expect(sameLayout(base, [{ i: 'a', x: 0, y: 0, w: 2, h: 2 }])).toBe(true)
    expect(sameLayout(base, [{ i: 'a', x: 1, y: 0, w: 2, h: 2 }])).toBe(false)
    expect(sameLayout(base, [{ i: 'a', x: 0, y: 0, w: 2, h: 2 }, { i: 'b', x: 2, y: 0, w: 2, h: 2 }])).toBe(false)
  })
})
