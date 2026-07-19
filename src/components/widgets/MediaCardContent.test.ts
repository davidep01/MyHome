import { describe, expect, it } from 'vitest'
import { formatMediaTime, mediaPositionAt } from './utils/mediaProgress'

describe('media card live metadata', () => {
  it('advances playing progress from the pushed HA timestamp', () => {
    expect(mediaPositionAt({
      position: 10,
      duration: 120,
      updatedAt: '2026-07-19T12:00:00.000Z',
      playing: true,
    }, Date.parse('2026-07-19T12:00:05.000Z'))).toBe(15)
  })

  it('clamps playback and formats long live streams', () => {
    expect(mediaPositionAt({ position: 118, duration: 120, updatedAt: '2026-07-19T12:00:00.000Z', playing: true }, Date.parse('2026-07-19T12:00:10.000Z'))).toBe(120)
    expect(formatMediaTime(46_803)).toBe('13:00:03')
  })
})
