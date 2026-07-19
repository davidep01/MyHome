import { describe, expect, it } from 'vitest'
import { sumPowerPoints } from './powerHistory'

describe('energy total history', () => {
  it('sums house and car using the latest value known for each stream', () => {
    expect(sumPowerPoints(
      [{ at: 1, kw: 0.2 }, { at: 3, kw: 0.4 }],
      [{ at: 1, kw: 5.1 }, { at: 2, kw: 5.3 }],
    )).toEqual([
      { at: 1, kw: 5.3 },
      { at: 2, kw: 5.5 },
      { at: 3, kw: 5.7 },
    ])
  })

  it('keeps working when only one sensor has history', () => {
    expect(sumPowerPoints([{ at: 1, kw: 0.25 }], [])).toEqual([{ at: 1, kw: 0.25 }])
  })
})
