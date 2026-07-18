import { describe, expect, it } from 'vitest'
import { MAX_KNOWN_FACES, normalizeCalendarFeedUrl, validateConfigPatch } from './config-validation.js'

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

describe('calendar feed configuration', () => {
  it('accepts HTTPS and normalizes webcal links', () => {
    expect(normalizeCalendarFeedUrl('webcal://calendar.example.com/family.ics')).toBe('https://calendar.example.com/family.ics')
    expect(validateConfigPatch({ calendarFeedUrl: 'https://calendar.example.com/family.ics' })).toMatchObject({ ok: true })
  })

  it('rejects non-HTTPS links', () => {
    expect(normalizeCalendarFeedUrl('http://calendar.example.com/family.ics')).toBeNull()
    expect(normalizeCalendarFeedUrl('file:///tmp/family.ics')).toBeNull()
    expect(normalizeCalendarFeedUrl('https://calendar.example.com/family.ics#fragment')).toBeNull()
  })
})
