import { describe, expect, it } from 'vitest'
import type { HassEntities } from 'home-assistant-js-websocket'
import type { HomeWidget } from '../api/backend'
import { contentAwareHomeWidgets } from './contentAwareHome'

const widget = (id: string, type: HomeWidget['type'], size: HomeWidget['size'], entityId?: string): HomeWidget => ({
  id, type, size, entityId,
})

/** La visibilità è opt-in: questi test sul dimensionamento partono da attivo. */
const on = (overrides: Record<string, object> = {}) => Object.fromEntries(
  Object.entries(overrides).map(([id, value]) => [id, { enabled: true, ...value }]),
)

describe('content aware home widgets', () => {
  it('promuove i media troppo piccoli prima del packing', () => {
    const widgets = [widget('media', 'entity', 'sm', 'media_player.apple_tv')]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities, on({ 'media_player.apple_tv': {} }))
      .map((item) => item.size)).toEqual(['md'])
  })

  it('lascia compatte le entità semplici e rende ampi i riepiloghi', () => {
    const widgets = [widget('light', 'entity', 'sm', 'light.sala'), widget('stats', 'quickStats', 'sm')]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities, on({ 'light.sala': {} }))
      .map((item) => item.size)).toEqual(['sm', 'wide'])
  })

  it('riconosce una remote Apple TV configurata come media', () => {
    const widgets = [widget('apple-tv', 'entity', 'sm', 'remote.apple_tv')]
    const adapted = contentAwareHomeWidgets(widgets, {} as HassEntities, on({ 'remote.apple_tv': { type: 'media' } }))
    expect(adapted[0].size).toBe('md')
  })

  it('rispetta la dimensione esplicita anche quando il contenuto suggerirebbe altro', () => {
    const widgets = [widget('media', 'entity', 'lg', 'media_player.apple_tv')]
    const adapted = contentAwareHomeWidgets(widgets, {} as HassEntities, on({ 'media_player.apple_tv': { cardSize: 'XS' } }))
    expect(adapted[0].size).toBe('xs')
  })

  it('sceglie solo fra le dimensioni multiple abilitate', () => {
    const widgets = [widget('media', 'entity', 'sm', 'media_player.apple_tv')]
    const medium = contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'media_player.apple_tv': { cardSizes: ['S', 'M'], enabled: true },
    })
    const compact = contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'media_player.apple_tv': { cardSizes: ['XS'], enabled: true },
    })
    expect(medium[0].size).toBe('md')
    expect(compact[0].size).toBe('xs')
  })
})

describe('widget che non possono mostrare nulla', () => {
  it('toglie le videocamere dalla griglia: il video vive nella tendina', () => {
    const widgets: HomeWidget[] = [
      { id: 'a', type: 'camera', size: 'lg', entityId: 'camera.giardino' },
      { id: 'b', type: 'clock', size: 'md' },
    ]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'camera.giardino': { enabled: true },
    }).map((w) => w.id)).toEqual(['b'])
  })

  it('toglie i dispositivi non ancora scelti nel wizard', () => {
    const widgets: HomeWidget[] = [
      { id: 'a', type: 'entity', size: 'sm', entityId: 'light.sala' },
      { id: 'b', type: 'entity', size: 'sm', entityId: 'light.bagno' },
    ]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities, {
      'light.sala': { enabled: true },
    }).map((w) => w.id)).toEqual(['a'])
  })

  it('non tocca i widget informativi, che non dipendono da un entità', () => {
    const widgets: HomeWidget[] = [
      { id: 'a', type: 'clock', size: 'md' },
      { id: 'b', type: 'weather', size: 'md' },
      { id: 'c', type: 'quickStats', size: 'wide' },
    ]
    expect(contentAwareHomeWidgets(widgets, {} as HassEntities).map((w) => w.id)).toEqual(['a', 'b', 'c'])
  })
})
