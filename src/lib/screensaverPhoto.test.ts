import { describe, expect, it } from 'vitest'
import { centeredKenBurnsMove, photoOrientation } from './screensaverPhoto'

describe('screensaver photo composition', () => {
  it('classifies landscape, portrait and square frames', () => {
    expect(photoOrientation(1920, 1080)).toBe('landscape')
    expect(photoOrientation(1080, 1920)).toBe('portrait')
    expect(photoOrientation(1200, 1200)).toBe('square')
    expect(photoOrientation(0, 1200)).toBe('unknown')
  })

  it('always finishes the Ken Burns movement in the optical centre', () => {
    for (const orientation of ['unknown', 'landscape', 'portrait', 'square'] as const) {
      const move = centeredKenBurnsMove(1, orientation)
      expect(move.x[1]).toBe('0%')
      expect(move.y[1]).toBe('0%')
      expect(move.foregroundScale[1]).toBe(1)
    }
  })

  it('never pans a vertical photo horizontally', () => {
    expect(centeredKenBurnsMove(0, 'portrait').x).toEqual(['0%', '0%'])
    expect(centeredKenBurnsMove(1, 'portrait').x).toEqual(['0%', '0%'])
  })
})
