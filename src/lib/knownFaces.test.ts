import { describe, expect, it } from 'vitest'
import { canAddKnownFace, MAX_KNOWN_FACES } from './knownFaces'

describe('known face UI limit', () => {
  it('allows additions only below eight people', () => {
    expect(canAddKnownFace(MAX_KNOWN_FACES - 1)).toBe(true)
    expect(canAddKnownFace(MAX_KNOWN_FACES)).toBe(false)
    expect(canAddKnownFace(MAX_KNOWN_FACES + 1)).toBe(false)
  })
})
