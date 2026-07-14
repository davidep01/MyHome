import { describe, expect, it } from 'vitest'
import { screensaverInternals } from './screensaver.js'

describe('screensaver local photo paths', () => {
  it('accepts only flat supported image filenames', () => {
    expect(screensaverInternals.safePhotoName('vacanze 01.jpg')).toBe('vacanze 01.jpg')
    expect(screensaverInternals.safePhotoName('ritratto.AVIF')).toBe('ritratto.AVIF')
    expect(screensaverInternals.safePhotoName('../db.json')).toBeNull()
    expect(screensaverInternals.safePhotoName('album/foto.jpg')).toBeNull()
    expect(screensaverInternals.safePhotoName('.segreto.jpg')).toBeNull()
    expect(screensaverInternals.safePhotoName('foto.svg')).toBeNull()
  })
})
