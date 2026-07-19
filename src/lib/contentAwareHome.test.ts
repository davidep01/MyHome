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
})
