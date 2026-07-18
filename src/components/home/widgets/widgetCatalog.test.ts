import { describe, expect, it } from 'vitest'
import { WIDGET_META, WIDGET_ORDER } from './widgetCatalog'

describe('widgetCatalog', () => {
  it('offers S, M, L and XL for every home tile', () => {
    for (const type of WIDGET_ORDER) {
      expect(WIDGET_META[type].sizes, type).toEqual(['sm', 'md', 'lg', 'wide'])
      expect(WIDGET_META[type].sizes, type).toContain(WIDGET_META[type].defaultSize)
    }
  })
})
