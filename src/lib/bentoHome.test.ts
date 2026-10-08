import { describe, expect, it } from 'vitest'
import { bentoCardSize, bentoLayout, orderBentoEntities } from './bentoHome'

describe('bentoLayout', () => {
  it('satura sempre la griglia: area delle tessere = colonne × righe', () => {
    for (let n = 1; n <= 30; n++) {
      const layout = bentoLayout(n)
      expect(layout.spans).toHaveLength(n)
      expect(layout.spans.reduce((a, b) => a + b, 0)).toBe(layout.cols * layout.rows)
      expect(Math.max(...layout.spans)).toBeLessThanOrEqual(layout.cols)
    }
  })

  it('meno card → card più grandi', () => {
    expect(bentoCardSize(1, bentoLayout(1))).toBe('L')
    expect(bentoLayout(2).spans.map((s) => bentoCardSize(s, bentoLayout(2)))).toEqual(['XL', 'XL'])
    const three = bentoLayout(3)
    expect(three.spans.map((s) => bentoCardSize(s, three))).toEqual(['XL', 'M', 'M'])
    const twelve = bentoLayout(12)
    expect(twelve.spans.every((s) => bentoCardSize(s, twelve) === 'S')).toBe(true)
  })

  it('zero card → griglia vuota', () => {
    expect(bentoLayout(0).spans).toEqual([])
  })
})

describe('orderBentoEntities', () => {
  it('ordina per categoria e poi per nome, in modo stabile', () => {
    const names: Record<string, string> = { 'light.b': 'Sala', 'light.a': 'Cucina', 'sensor.t': 'Temp', 'climate.c': 'Clima' }
    expect(orderBentoEntities(['sensor.t', 'light.b', 'climate.c', 'light.a'], (id) => names[id]))
      .toEqual(['climate.c', 'light.a', 'light.b', 'sensor.t'])
  })
})
