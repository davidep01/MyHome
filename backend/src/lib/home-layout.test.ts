import { describe, expect, it } from 'vitest'
import { MAX_HOME_WIDGETS, mergeHomeConfig, parseHomeWidgets } from './home-layout.js'

describe('parseHomeWidgets', () => {
  it('accetta una lista valida di widget', () => {
    const widgets = parseHomeWidgets([
      { id: 'w-clock', type: 'clock', size: 'md' },
      { id: 'w-light', type: 'entity', size: 'sm', entityId: 'light.salotto' },
    ])
    expect(widgets).toEqual([
      { id: 'w-clock', type: 'clock', size: 'md' },
      { id: 'w-light', type: 'entity', size: 'sm', entityId: 'light.salotto' },
    ])
  })

  it('rifiuta liste vuote, troppo lunghe o con id duplicati', () => {
    expect(parseHomeWidgets([])).toBeNull()
    expect(parseHomeWidgets([
      { id: 'dup', type: 'clock', size: 'sm' },
      { id: 'dup', type: 'weather', size: 'md' },
    ])).toBeNull()
    const tooMany = Array.from({ length: MAX_HOME_WIDGETS + 1 }, (_, i) => ({ id: `w${i}`, type: 'clock', size: 'sm' }))
    expect(parseHomeWidgets(tooMany)).toBeNull()
  })

  it('rifiuta tipo o taglia sconosciuti (nessun drop silenzioso)', () => {
    expect(parseHomeWidgets([{ id: 'x', type: 'bogus', size: 'sm' }])).toBeNull()
    expect(parseHomeWidgets([{ id: 'x', type: 'clock', size: 'huge' }])).toBeNull()
  })

  it('merge con nuovi widget bumpa la versione e riposiziona senza collisioni', () => {
    const base = mergeHomeConfig(undefined, {}, 'system')
    const next = mergeHomeConfig(base, {
      widgets: [
        { id: 'w-clock', type: 'clock', size: 'md' },
        { id: 'w-a', type: 'entity', size: 'sm', entityId: 'light.a' },
        { id: 'w-b', type: 'entity', size: 'sm', entityId: 'light.b' },
      ],
      layoutVersion: base.layoutVersion,
    }, 'tablet')
    expect(next.widgets.map((w) => w.id)).toEqual(['w-clock', 'w-a', 'w-b'])
    expect(next.layoutVersion).toBeGreaterThan(base.layoutVersion ?? 1)
    const cells = new Set<string>()
    for (const pos of Object.values(next.positions ?? {})) {
      for (let y = pos.y; y < pos.y + pos.h; y += 1) {
        for (let x = pos.x; x < pos.x + pos.w; x += 1) {
          const cell = `${x}:${y}`
          expect(cells.has(cell)).toBe(false)
          cells.add(cell)
        }
      }
    }
  })
})
