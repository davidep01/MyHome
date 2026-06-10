import { describe, expect, it } from 'vitest'
import { applyCompressedEvent } from './ha-ws-codec.js'
import type { HaEntityLike } from './ha-stream.js'

const T0 = 1_750_000_000 // epoch seconds
const ISO0 = new Date(T0 * 1000).toISOString()

function seeded(): Map<string, HaEntityLike> {
  const map = new Map<string, HaEntityLike>()
  applyCompressedEvent(map, {
    a: {
      'light.kitchen': { s: 'on', a: { brightness: 200, color_temp: 350 }, c: 'ctx-1', lc: T0 },
      'sensor.temp': { s: '21.5', a: { unit_of_measurement: '°C' }, lc: T0, lu: T0 + 5 },
    },
  })
  return map
}

describe('applyCompressedEvent (subscribe_entities codec)', () => {
  it('builds the full map from the initial "a" event', () => {
    const map = seeded()
    expect(map.size).toBe(2)
    const light = map.get('light.kitchen')!
    expect(light.state).toBe('on')
    expect(light.attributes).toEqual({ brightness: 200, color_temp: 350 })
    expect(light.last_changed).toBe(ISO0)
    // lu omitted → equals lc
    expect(light.last_updated).toBe(ISO0)
    // bare context id string → { id }
    expect(light.context).toEqual({ id: 'ctx-1' })
  })

  it('keeps distinct last_updated when lu differs from lc', () => {
    const map = seeded()
    const sensor = map.get('sensor.temp')!
    expect(sensor.last_changed).toBe(ISO0)
    expect(sensor.last_updated).toBe(new Date((T0 + 5) * 1000).toISOString())
  })

  it('merges a "+" diff: state, changed attributes, timestamps', () => {
    const map = seeded()
    const { changed, removed } = applyCompressedEvent(map, {
      c: { 'light.kitchen': { '+': { s: 'off', a: { brightness: 0 }, lc: T0 + 60 } } },
    })
    expect(removed).toEqual([])
    expect(changed).toHaveLength(1)
    const light = map.get('light.kitchen')!
    expect(light.state).toBe('off')
    // untouched attributes survive the merge
    expect(light.attributes).toEqual({ brightness: 0, color_temp: 350 })
    expect(light.last_changed).toBe(new Date((T0 + 60) * 1000).toISOString())
    // a state change moves last_updated together with last_changed
    expect(light.last_updated).toBe(new Date((T0 + 60) * 1000).toISOString())
  })

  it('an attribute-only change updates lu but not lc', () => {
    const map = seeded()
    applyCompressedEvent(map, {
      c: { 'sensor.temp': { '+': { a: { battery: 80 }, lu: T0 + 120 } } },
    })
    const sensor = map.get('sensor.temp')!
    expect(sensor.last_changed).toBe(ISO0)
    expect(sensor.last_updated).toBe(new Date((T0 + 120) * 1000).toISOString())
    expect(sensor.state).toBe('21.5')
  })

  it('removes attribute keys listed under "-"', () => {
    const map = seeded()
    applyCompressedEvent(map, {
      c: { 'light.kitchen': { '-': { a: ['color_temp'] } } },
    })
    expect(map.get('light.kitchen')!.attributes).toEqual({ brightness: 200 })
  })

  it('removes entities listed in "r"', () => {
    const map = seeded()
    const { removed } = applyCompressedEvent(map, { r: ['sensor.temp', 'sensor.ghost'] })
    expect(removed).toEqual(['sensor.temp'])
    expect(map.has('sensor.temp')).toBe(false)
    expect(map.size).toBe(1)
  })

  it('ignores a diff for an entity it has never seen', () => {
    const map = seeded()
    const { changed } = applyCompressedEvent(map, {
      c: { 'switch.unknown': { '+': { s: 'on' } } },
    })
    expect(changed).toEqual([])
    expect(map.has('switch.unknown')).toBe(false)
  })

  it('handles add + change + remove in one event', () => {
    const map = seeded()
    const { changed, removed } = applyCompressedEvent(map, {
      a: { 'cover.gate': { s: 'closed', lc: T0 + 10 } },
      c: { 'light.kitchen': { '+': { s: 'off', lc: T0 + 10 } } },
      r: ['sensor.temp'],
    })
    expect(changed.map((e) => e.entity_id).sort()).toEqual(['cover.gate', 'light.kitchen'])
    expect(removed).toEqual(['sensor.temp'])
    expect(map.size).toBe(2)
  })
})
