import { describe, expect, it } from 'vitest'
import { getWidgetSizeConfig, resolveEnabledCardSize, widgetVisualSizeFromHomeSize } from './getWidgetSizeConfig'

describe('home widget visual sizes', () => {
  it('maps the five persisted sizes to five distinct presentation levels', () => {
    expect(['xs', 'sm', 'md', 'lg', 'wide'].map((size) => widgetVisualSizeFromHomeSize(size as 'xs' | 'sm' | 'md' | 'lg' | 'wide')))
      .toEqual(['XS', 'S', 'M', 'L', 'XL'])
    expect(getWidgetSizeConfig('XL').valueClass).toBe('text-[36px]')
    expect(['XS', 'S', 'M', 'L', 'XL'].map((size) => {
      const config = getWidgetSizeConfig(size as 'XS' | 'S' | 'M' | 'L' | 'XL')
      return [config.slots, config.rows]
    })).toEqual([[1, 1], [1, 1], [2, 1], [3, 2], [3, 1]])
  })
})

describe('resolve enabled card sizes', () => {
  it('forces a single enabled size', () => {
    expect(resolveEnabledCardSize('L', { cardSizes: ['XS'] })).toBe('XS')
  })

  it('keeps an ideal enabled size and otherwise picks the nearest compact one', () => {
    expect(resolveEnabledCardSize('M', { cardSizes: ['S', 'M', 'XL'] })).toBe('M')
    expect(resolveEnabledCardSize('L', { cardSizes: ['S', 'M'] })).toBe('M')
  })

  it('keeps legacy single-size overrides compatible', () => {
    expect(resolveEnabledCardSize('M', { cardSize: 'XL' })).toBe('XL')
  })
})
