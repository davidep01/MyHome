import { describe, expect, it } from 'vitest'
import { getWidgetSizeConfig, resolveEnabledCardSize, widgetVisualSizeFromHomeSize } from './getWidgetSizeConfig'

describe('home widget visual sizes', () => {
  it('maps the four persisted sizes to four distinct presentation levels', () => {
    expect(['sm', 'md', 'lg', 'wide'].map((size) => widgetVisualSizeFromHomeSize(size as 'sm' | 'md' | 'lg' | 'wide')))
      .toEqual(['S', 'M', 'L', 'XL'])
    expect(getWidgetSizeConfig('XL').valueClass).toBe('text-[36px]')
  })
})

describe('resolve enabled card sizes', () => {
  it('forces a single enabled size', () => {
    expect(resolveEnabledCardSize('L', { cardSizes: ['S'] })).toBe('S')
  })

  it('keeps an ideal enabled size and otherwise picks the nearest compact one', () => {
    expect(resolveEnabledCardSize('M', { cardSizes: ['S', 'M', 'XL'] })).toBe('M')
    expect(resolveEnabledCardSize('L', { cardSizes: ['S', 'M'] })).toBe('M')
  })

  it('keeps legacy single-size overrides compatible', () => {
    expect(resolveEnabledCardSize('M', { cardSize: 'XL' })).toBe('XL')
  })
})
