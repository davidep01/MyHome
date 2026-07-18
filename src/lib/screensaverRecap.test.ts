import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { buildScreensaverRecapInput } from './screensaverRecap'

function entity(id: string, state: string, attributes: Record<string, unknown> = {}, changed = '2026-07-18T12:00:00Z'): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    context: { id: 'test', parent_id: null, user_id: null },
    last_changed: changed,
    last_updated: changed,
  }
}

function entities(...items: HassEntity[]): HassEntities {
  return Object.fromEntries(items.map((item) => [item.entity_id, item]))
}

describe('screensaver recap context', () => {
  it('prioritizes security and summarizes active home information', () => {
    const input = buildScreensaverRecapInput(entities(
      entity('binary_sensor.porta', 'on', { device_class: 'door', friendly_name: 'Porta ingresso' }),
      entity('light.cucina', 'on', { friendly_name: 'Cucina', brightness: 128 }),
      entity('climate.soggiorno', 'cool', { friendly_name: 'Soggiorno', current_temperature: 27, temperature: 24 }),
      entity('media_player.tv', 'playing', { friendly_name: 'Apple TV', media_title: 'Film' }),
    ), new Date('2026-07-18T14:00:00Z'))

    expect(input.localText).toContain('1 apertura risulta aperta')
    expect(input.localText).toContain('1 luce accesa')
    expect(input.context[5]).toMatchObject({ entity_id: 'binary_sensor.porta', name: 'Porta ingresso' })
    expect(input.context).toContainEqual(expect.objectContaining({ entity_id: 'climate.soggiorno', state: 'cool · ambiente 27 °C · obiettivo 24 °C' }))
  })

  it('includes only today and tomorrow waste information', () => {
    const input = buildScreensaverRecapInput(entities(
      entity('sensor.waste_collection_schedule_rifiuti', 'Plastic tomorrow', {
        friendly_name: 'Raccolta rifiuti',
        '2026-07-19': 'Plastic and metals',
        '2026-07-22': 'Glass',
      }),
    ), new Date('2026-07-18T14:00:00Z'))

    expect(input.context).toContainEqual(expect.objectContaining({
      entity_id: 'sensor.waste_collection_schedule_rifiuti',
      state: 'domani: Plastica',
    }))
  })

  it('returns a stable fallback while Home Assistant is loading', () => {
    expect(buildScreensaverRecapInput({})).toEqual({
      context: [],
      localText: 'In attesa degli ultimi aggiornamenti della casa.',
      signature: 'empty',
    })
  })
})
