import { describe, expect, it } from 'vitest'
import { resolveMediaArtwork } from './mediaArtwork'

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

  it('ignores empty and non-string values', () => {
    expect(resolveMediaArtwork({ entity_picture: ' ', media_image_url: 42 })).toBeUndefined()
  })
})
