import { describe, expect, it } from 'vitest'
import { summaryLabel } from './homeRevisions'

const BASE = { widgetsAdded: 0, widgetsRemoved: 0, widgetsMoved: 0, widgetsResized: 0, reordered: false }

describe('summaryLabel', () => {
  it('describes a no-op summary', () => {
    expect(summaryLabel(BASE)).toBe('Nessuna modifica')
  })

  it('pluralizes moved/resized correctly for singular and plural counts', () => {
    expect(summaryLabel({ ...BASE, widgetsMoved: 1 })).toBe('1 spostato')
    expect(summaryLabel({ ...BASE, widgetsMoved: 2 })).toBe('2 spostati')
    expect(summaryLabel({ ...BASE, widgetsResized: 1 })).toBe('1 ridimensionato')
    expect(summaryLabel({ ...BASE, widgetsResized: 3 })).toBe('3 ridimensionati')
  })

  it('combines multiple kinds of change in order', () => {
    expect(summaryLabel({ widgetsAdded: 2, widgetsRemoved: 1, widgetsMoved: 1, widgetsResized: 0, reordered: false }))
      .toBe('+2 widget · -1 widget · 1 spostato')
  })

  it('reports a pure reorder', () => {
    expect(summaryLabel({ ...BASE, reordered: true })).toBe('riordinati')
  })
})
