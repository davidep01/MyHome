import { describe, expect, it } from 'vitest'
import { recordUsage, usageScore } from './cardUsage'

const DAY = 24 * 60 * 60 * 1000

describe('cardUsage', () => {
  it('ogni tocco vale 1 e i tocchi si sommano', () => {
    let map = recordUsage({}, 'light.sala', 0)
    map = recordUsage(map, 'light.sala', 0)
    expect(usageScore(map['light.sala'], 0)).toBe(2)
  })

  it("dimezza dopo 7 giorni: le abitudini recenti contano di più", () => {
    const map = recordUsage({}, 'light.sala', 0)
    expect(usageScore(map['light.sala'], 7 * DAY)).toBeCloseTo(0.5)
    expect(usageScore(undefined, 0)).toBe(0)
  })

  it('oltre il tetto dimentica le entità meno usate', () => {
    let map = {}
    for (let i = 0; i < 305; i++) map = recordUsage(map, `light.l${i}`, i)
    expect(Object.keys(map)).toHaveLength(300)
    expect(map).not.toHaveProperty('light.l0')
  })
})
