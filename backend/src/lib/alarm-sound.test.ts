import { describe, expect, it } from 'vitest'
import { createAlarmSirenWav } from './alarm-sound.js'

describe('native kiosk alarm sound', () => {
  it('builds a valid, audible PCM WAV payload', () => {
    const bytes = createAlarmSirenWav()
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))

    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(36, 4)).toBe('data')
    expect(bytes.byteLength).toBeGreaterThan(60_000)
    expect(bytes.some((value, index) => index > 44 && value !== 0)).toBe(true)
  })
})
