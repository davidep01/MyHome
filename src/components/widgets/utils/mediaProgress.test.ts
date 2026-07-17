import { describe, expect, it } from 'vitest'
import { mediaProgressPct } from './mediaProgress'

const T0 = Date.parse('2026-07-17T10:00:00Z')

describe('mediaProgressPct', () => {
  it('calcola la percentuale dalla posizione misurata', () => {
    expect(mediaProgressPct({ position: 60, duration: 240, playing: false }, T0)).toBe(25)
  })

  it('avanza localmente mentre suona', () => {
    const pct = mediaProgressPct(
      { position: 60, duration: 240, updatedAt: '2026-07-17T10:00:00Z', playing: true },
      T0 + 60_000,
    )
    expect(pct).toBe(50)
  })

  it('non avanza in pausa', () => {
    const pct = mediaProgressPct(
      { position: 60, duration: 240, updatedAt: '2026-07-17T10:00:00Z', playing: false },
      T0 + 60_000,
    )
    expect(pct).toBe(25)
  })

  it('si ferma al 100% e non va sotto zero', () => {
    expect(mediaProgressPct({ position: 500, duration: 240, playing: false }, T0)).toBe(100)
    expect(mediaProgressPct({ position: -5, duration: 240, playing: false }, T0)).toBe(0)
  })

  it('durata assente o nulla → 0', () => {
    expect(mediaProgressPct({ position: 10, duration: 0, playing: true }, T0)).toBe(0)
    expect(mediaProgressPct({ position: 10, duration: Number.NaN, playing: true }, T0)).toBe(0)
  })
})
