import { describe, expect, it } from 'vitest'
import type { HassEntities } from 'home-assistant-js-websocket'
import type { HomeWidget } from '../api/backend'
import { contentAwareHomeWidgets } from './contentAwareHome'

const widget = (id: string, type: HomeWidget['type'], size: HomeWidget['size'], entityId?: string): HomeWidget => ({
  id, type, size, entityId,
})

describe('content aware home widgets', () => {
  it('promuove media e camere troppo piccole prima del packing', () => {
    const widgets = [
      widget('media', 'entity', 'sm', 'media_player.apple_tv'),
      widget('camera', 'camera', 'md', 'camera.entrata'),
    ]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities).map((item) => item.size)).toEqual(['md', 'lg'])
  })

  it('lascia compatte le entità semplici e rende ampi i riepiloghi', () => {
    const widgets = [widget('light', 'entity', 'sm', 'light.sala'), widget('stats', 'quickStats', 'sm')]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities).map((item) => item.size)).toEqual(['sm', 'wide'])
  })

  it('riconosce una remote Apple TV configurata come media', () => {
    const widgets = [widget('apple-tv', 'entity', 'sm', 'remote.apple_tv')]
    const adapted = contentAwareHomeWidgets(widgets, {} as HassEntities, { 'remote.apple_tv': { type: 'media' } })
    expect(adapted[0].size).toBe('md')
  })

  it('rispetta la dimensione esplicita anche quando il contenuto suggerirebbe altro', () => {
    const widgets = [widget('media', 'entity', 'lg', 'media_player.apple_tv')]
    const adapted = contentAwareHomeWidgets(widgets, {} as HassEntities, { 'media_player.apple_tv': { cardSize: 'S' } })
    expect(adapted[0].size).toBe('sm')
  })

  it('sceglie solo fra le dimensioni multiple abilitate', () => {
    const widgets = [widget('media', 'entity', 'sm', 'media_player.apple_tv')]
    const medium = contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'media_player.apple_tv': { cardSizes: ['S', 'M'] },
    })
    const compact = contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'media_player.apple_tv': { cardSizes: ['S'] },
    })
    expect(medium[0].size).toBe('md')
    expect(compact[0].size).toBe('sm')
  })
})
