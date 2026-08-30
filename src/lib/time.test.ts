import { describe, expect, it } from 'vitest'
import { compareVersions, durationSince } from './time'

const NOW = Date.parse('2026-08-30T12:00:00Z')

describe('durationSince', () => {
  it('formatta minuti, ore e giorni in italiano compatto', () => {
    expect(durationSince('2026-08-30T11:42:00Z', NOW)).toBe('18 min')
    expect(durationSince('2026-08-30T09:30:00Z', NOW)).toBe('2 h 30 min')
    expect(durationSince('2026-08-30T09:00:00Z', NOW)).toBe('3 h')
    expect(durationSince('2026-08-27T08:00:00Z', NOW)).toBe('3 g 4 h')
    expect(durationSince('2026-08-27T12:00:00Z', NOW)).toBe('3 g')
  })

  it('non trasforma un dato assente o futuro in uno zero credibile', () => {
    expect(durationSince(undefined, NOW)).toBe('')
    expect(durationSince(null, NOW)).toBe('')
    expect(durationSince('non-una-data', NOW)).toBe('')
    expect(durationSince('2026-08-30T12:05:00Z', NOW)).toBe('')
  })
})

describe('compareVersions', () => {
  it('ordina per numero, non per stringa', () => {
    expect(compareVersions('2.2.105', '2.2.99')).toBeGreaterThan(0)
    expect(compareVersions('2.2.99', '2.2.105')).toBeLessThan(0)
    expect(compareVersions('2.2.105', '2.2.105')).toBe(0)
    expect(compareVersions('2.3.0', '2.2.999')).toBeGreaterThan(0)
  })

  it('resta neutro su versioni non numeriche (build di sviluppo)', () => {
    expect(compareVersions('dev', '2.2.105')).toBe(0)
  })
})
