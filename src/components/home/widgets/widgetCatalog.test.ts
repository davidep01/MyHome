import { describe, expect, it } from 'vitest'
import { WIDGET_META, WIDGET_ORDER } from './widgetCatalog'

describe('widgetCatalog', () => {
  it('offers XS only to device cards and keeps every default valid', () => {
    for (const type of WIDGET_ORDER) {
      const expected = type === 'entity' || type === 'sensor' || type === 'camera'
        ? ['xs', 'sm', 'md', 'lg', 'wide']
        : ['sm', 'md', 'lg', 'wide']
      expect(WIDGET_META[type].sizes, type).toEqual(expected)
      expect(WIDGET_META[type].sizes, type).toContain(WIDGET_META[type].defaultSize)
    }
  })
})
