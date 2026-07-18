import { describe, expect, it } from 'vitest'
import { haImageInternals } from './ha.js'

describe('Home Assistant media image revision', () => {
  it('separates cached bytes when a pushed media revision changes', () => {
    const source = 'https://example.test/reused-cover.jpg'
    expect(haImageInternals.imageCacheKey(source, 'track-a'))
      .not.toBe(haImageInternals.imageCacheKey(source, 'track-b'))
    expect(haImageInternals.imageCacheKey(source)).toBe(source)
  })

  it('accepts compact client revisions and rejects cache-key injection', () => {
    expect(haImageInternals.validRevision('1q2w3e')).toBe(true)
    expect(haImageInternals.validRevision('episode_42-next')).toBe(true)
    expect(haImageInternals.validRevision('bad/revision')).toBe(false)
    expect(haImageInternals.validRevision('x'.repeat(65))).toBe(false)
  })
})
