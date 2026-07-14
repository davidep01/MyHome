import { describe, expect, it } from 'vitest'
import { shouldRecognizeDoorbell } from './doorbellRecognition'

describe('doorbell recognition consent gate', () => {
  it('runs only for a real camera-backed ring with explicit vision consent', () => {
    expect(shouldRecognizeDoorbell(true, true, true, false)).toBe(true)
    expect(shouldRecognizeDoorbell(true, true, false, false)).toBe(false)
    expect(shouldRecognizeDoorbell(true, true, true, true)).toBe(false)
    expect(shouldRecognizeDoorbell(false, true, true, false)).toBe(false)
  })
})
