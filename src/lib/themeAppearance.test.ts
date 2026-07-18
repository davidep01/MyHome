import { describe, expect, it } from 'vitest'
import { resolveInitialDark } from './themeAppearance'

describe('initial appearance', () => {
  it('respects an explicit Dark preference', () => {
    expect(resolveInitialDark('dark', false)).toBe(true)
  })

  it('respects an explicit Light preference', () => {
    expect(resolveInitialDark('light', true)).toBe(false)
  })

  it('uses the operating system for Auto or an unset preference', () => {
    expect(resolveInitialDark('auto', true)).toBe(true)
    expect(resolveInitialDark(null, false)).toBe(false)
  })
})
