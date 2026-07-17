import { describe, expect, it } from 'vitest'
import { advertisedArtworkSources } from './ha-media.js'

describe('HA advertised artwork', () => {
  it('accepts canonical cover, integration fallback and app icon', () => {
    expect(advertisedArtworkSources({
      entity_picture: '/api/media_player_proxy/media_player.apple_tv',
      media_image_url: 'https://example.test/movie.jpg',
      app_icon: 'https://example.test/app.png',
    })).toEqual([
      '/api/media_player_proxy/media_player.apple_tv',
      'https://example.test/movie.jpg',
      'https://example.test/app.png',
    ])
  })

  it('removes empty and duplicate sources', () => {
    expect(advertisedArtworkSources({ entity_picture: 'x', media_image_url: 'x', app_icon: '' })).toEqual(['x'])
  })
})
