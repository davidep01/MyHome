import { describe, expect, it } from 'vitest'
import { embeddedMediaArtwork, resolveMediaArtwork } from './mediaArtwork'

describe('resolveMediaArtwork', () => {
  it('prefers the canonical Home Assistant entity picture', () => {
    expect(resolveMediaArtwork({
      entity_picture: '/api/media_player_proxy/media_player.apple_tv?token=cover',
      app_icon: 'https://example.test/app.png',
    })).toContain('media_player_proxy')
  })

  it('falls back to Apple TV media and app artwork attributes', () => {
    expect(resolveMediaArtwork({ media_image_url: 'https://example.test/movie.jpg' })).toBe('https://example.test/movie.jpg')
    expect(resolveMediaArtwork({ app_icon: 'https://example.test/tv.png' })).toBe('https://example.test/tv.png')
  })

  it('uses the JPEG embedded by Apple TV instead of its HEIC HA proxy', () => {
    const picture = '/api/media_player_proxy/media_player.soggiorno?token=secret&cache=https%3A%2F%2Fis1-ssl.mzstatic.com%2Fcover%2F%7Bw%7Dx%7Bh%7D%7Bc%7D.%7Bf%7D'
    expect(embeddedMediaArtwork(picture)).toBe('https://is1-ssl.mzstatic.com/cover/512x512bb.jpg')
    expect(resolveMediaArtwork({ entity_picture: picture })).toBe('https://is1-ssl.mzstatic.com/cover/512x512bb.jpg')
  })

  it('ignores empty and non-string values', () => {
    expect(resolveMediaArtwork({ entity_picture: ' ', media_image_url: 42 })).toBeUndefined()
  })
})
