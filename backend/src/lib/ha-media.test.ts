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

  it('allows the safe JPEG template embedded by Apple TV', () => {
    const picture = '/api/media_player_proxy/media_player.soggiorno?token=secret&cache=https%3A%2F%2Fis1-ssl.mzstatic.com%2Fcover%2F%7Bw%7Dx%7Bh%7D%7Bc%7D.%7Bf%7D'
    expect(advertisedArtworkSources({ entity_picture: picture })).toEqual([
      picture,
      'https://is1-ssl.mzstatic.com/cover/512x512bb.jpg',
    ])
  })
})
