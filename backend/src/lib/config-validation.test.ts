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

describe('screensaver AI recap selection', () => {
  it('accepts an explicit device allowlist, including an empty selection', () => {
    expect(validateConfigPatch({
      kiosk: { screensaver: { recapEntityIds: ['light.cucina', 'sensor.temperatura'] } },
    })).toMatchObject({
      ok: true,
      value: { kiosk: { screensaver: { recapEntityIds: ['light.cucina', 'sensor.temperatura'] } } },
    })
    expect(validateConfigPatch({ kiosk: { screensaver: { recapEntityIds: [] } } })).toMatchObject({
      ok: true,
      value: { kiosk: { screensaver: { recapEntityIds: [] } } },
    })
  })

  it('rejects invalid or oversized recap selections', () => {
    expect(validateConfigPatch({ kiosk: { screensaver: { recapEntityIds: ['not-an-entity'] } } })).toMatchObject({ ok: false })
    expect(validateConfigPatch({
      kiosk: { screensaver: { recapEntityIds: Array.from({ length: 101 }, (_, index) => `sensor.item_${index}`) } },
    })).toMatchObject({ ok: false })
  })
})

describe('device card size override', () => {
  it('accepts the four supported preview sizes', () => {
    for (const cardSize of ['S', 'M', 'L', 'XL']) {
      expect(validateConfigPatch({
        deviceOverrides: { 'light.sala': { cardSize } },
      })).toMatchObject({ ok: true, value: { deviceOverrides: { 'light.sala': { cardSize } } } })
    }
  })

  it('rejects unknown card sizes', () => {
    expect(validateConfigPatch({
      deviceOverrides: { 'light.sala': { cardSize: 'XXL' } },
    })).toMatchObject({ ok: false })
  })

  it('accepts multiple unique enabled sizes', () => {
    expect(validateConfigPatch({
      deviceOverrides: { 'media_player.soggiorno': { cardSizes: ['S', 'M', 'XL'] } },
    })).toMatchObject({
      ok: true,
      value: { deviceOverrides: { 'media_player.soggiorno': { cardSizes: ['S', 'M', 'XL'] } } },
    })
  })

  it('rejects empty, duplicate or unknown enabled sizes', () => {
    for (const cardSizes of [[], ['S', 'S'], ['S', 'XXL']]) {
      expect(validateConfigPatch({
        deviceOverrides: { 'light.sala': { cardSizes } },
      })).toMatchObject({ ok: false })
    }
  })
})
