import { describe, expect, it } from 'vitest'
import { MAX_KNOWN_FACES, validateConfigPatch } from './config-validation.js'

function face(index: number) {
  return {
    id: `face_${index}`,
    name: `Persona ${index}`,
    images: ['data:image/jpeg;base64,AA=='],
  }
}

describe('known face configuration limit', () => {
  it('accepts exactly eight people', () => {
    const faces = Array.from({ length: MAX_KNOWN_FACES }, (_, index) => face(index))
    expect(validateConfigPatch({ ai: { faces } })).toMatchObject({ ok: true, value: { ai: { faces } } })
  })

  it('rejects a ninth person', () => {
    const faces = Array.from({ length: MAX_KNOWN_FACES + 1 }, (_, index) => face(index))
    expect(validateConfigPatch({ ai: { faces } })).toEqual({ ok: false, error: 'Volti AI non validi' })
  })
})
