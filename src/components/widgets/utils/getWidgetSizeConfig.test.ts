import { describe, expect, it } from 'vitest'
import { getWidgetSizeConfig, widgetVisualSizeFromHomeSize } from './getWidgetSizeConfig'

describe('home widget visual sizes', () => {
  it('maps the four persisted sizes to four distinct presentation levels', () => {
    expect(['sm', 'md', 'lg', 'wide'].map((size) => widgetVisualSizeFromHomeSize(size as 'sm' | 'md' | 'lg' | 'wide')))
      .toEqual(['S', 'M', 'L', 'XL'])
    expect(getWidgetSizeConfig('XL').valueClass).toBe('text-[36px]')
  })
})
