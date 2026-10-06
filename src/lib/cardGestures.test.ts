import { describe, expect, it } from 'vitest'
import { swipePage, unlockProgress } from './cardGestures'
describe('gesti card', () => {
  it('distingue navigazione orizzontale da tap e scroll verticale', () => {
    expect(swipePage(-90, 2, 400)).toBe(1)
    expect(swipePage(90, 2, 400)).toBe(-1)
    expect(swipePage(20, 2, 400)).toBe(0)
    expect(swipePage(80, 100, 400)).toBe(0)
    expect(swipePage(80, 0, 0)).toBe(0)
  })
  it('lo sblocco richiede tutta la corsa e non accetta salti negativi o non finiti', () => {
    expect(unlockProgress(60, 100)).toBe(.6)
    expect(unlockProgress(100, 100)).toBe(1)
    expect(unlockProgress(-10, 100)).toBe(0)
    expect(unlockProgress(NaN, 100)).toBe(0)
    expect(unlockProgress(100, 0)).toBe(0)
  })
})
