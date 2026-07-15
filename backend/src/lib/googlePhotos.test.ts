import { describe, expect, it } from 'vitest'
import { extractGooglePhotoUrls, isGooglePhotoContentUrl, MAX_ALBUM_PHOTOS, photoUrlWithSize } from './googlePhotos.js'

const photoUrl = (id: string) => `https://lh3.googleusercontent.com/pw/${'x'.repeat(30)}${id}`

describe('extractGooglePhotoUrls', () => {
  it('estrae e deduplica gli URL base', () => {
    const html = `["${photoUrl('AA')}=w200-h100",123],["${photoUrl('AA')}=w1024",1],["${photoUrl('BB')}",2]`
    const urls = extractGooglePhotoUrls(html)
    expect(urls).toEqual([photoUrl('AA'), photoUrl('BB')])
  })

  it('scarta gli avatar (path /a/ o /a-)', () => {
    const html = `"https://lh3.googleusercontent.com/a/ACg8-avatar-di-un-utente-condiviso-xyz=s64" "${photoUrl('CC')}"`
    expect(extractGooglePhotoUrls(html)).toEqual([photoUrl('CC')])
  })

  it('limita a MAX_ALBUM_PHOTOS', () => {
    const html = Array.from({ length: MAX_ALBUM_PHOTOS + 20 }, (_, i) => `"${photoUrl(String(i).padStart(3, '0'))}"`).join(',')
    expect(extractGooglePhotoUrls(html)).toHaveLength(MAX_ALBUM_PHOTOS)
  })

  it('ritorna vuoto senza foto', () => {
    expect(extractGooglePhotoUrls('<html><body>album vuoto</body></html>')).toEqual([])
  })
})

describe('photoUrlWithSize', () => {
  it('appende la dimensione', () => {
    expect(photoUrlWithSize('https://lh3.googleusercontent.com/pw/abc', 800, 600))
      .toBe('https://lh3.googleusercontent.com/pw/abc=w800-h600-no')
  })
})

describe('isGooglePhotoContentUrl', () => {
  it('accetta solo host lh*.googleusercontent.com in https', () => {
    expect(isGooglePhotoContentUrl('https://lh3.googleusercontent.com/pw/abc')).toBe(true)
    expect(isGooglePhotoContentUrl('https://lh5.googleusercontent.com/x')).toBe(true)
    expect(isGooglePhotoContentUrl('http://lh3.googleusercontent.com/pw/abc')).toBe(false)
    expect(isGooglePhotoContentUrl('https://evil.example.com/pw/abc')).toBe(false)
    expect(isGooglePhotoContentUrl('non-un-url')).toBe(false)
  })
})
