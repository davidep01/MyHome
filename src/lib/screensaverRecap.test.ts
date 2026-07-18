import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { buildScreensaverRecapInput, collectScreensaverRecentChanges } from './screensaverRecap'

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

  it('includes live temperature sensors even when no climate zone is active', () => {
    const first = buildScreensaverRecapInput(entities(
      entity('sensor.temperatura_cucina', '21.4', {
        friendly_name: 'Temperatura cucina',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    ))
    const next = buildScreensaverRecapInput(entities(
      entity('sensor.temperatura_cucina', '22.1', {
        friendly_name: 'Temperatura cucina',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    ))

    expect(next.context).toContainEqual(expect.objectContaining({
      entity_id: 'sensor.temperatura_cucina',
      state: '22,1 °C',
    }))
    expect(next.localText).toContain('Temperatura cucina 22,1 °C')
    expect(next.signature).not.toBe(first.signature)
  })

  it('turns meaningful Home Assistant transitions into recent live events', () => {
    const before = entities(entity('light.cucina', 'off', { friendly_name: 'Luce cucina' }))
    const after = entities(entity('light.cucina', 'on', { friendly_name: 'Luce cucina', brightness: 204 }))
    const changedAt = new Date('2026-07-18T14:00:00Z').getTime()
    const changes = collectScreensaverRecentChanges(before, after, changedAt)
    const input = buildScreensaverRecapInput(after, new Date('2026-07-18T14:01:00Z'), changes)

    expect(changes).toEqual([expect.objectContaining({ description: 'Luce cucina si è accesa', changedAt })])
    expect(input.localText).toContain('Adesso: Luce cucina si è accesa')
    expect(input.context).toContainEqual(expect.objectContaining({
      entity_id: 'sensor.recap_evento_1',
      state: 'Luce cucina si è accesa',
    }))
  })

  it('ignores insignificant temperature jitter in the recent-event feed', () => {
    const attributes = {
      friendly_name: 'Temperatura camera',
      device_class: 'temperature',
      unit_of_measurement: '°C',
    }
    const changes = collectScreensaverRecentChanges(
      entities(entity('sensor.temperatura_camera', '21.40', attributes)),
      entities(entity('sensor.temperatura_camera', '21.49', attributes)),
    )

    expect(changes).toEqual([])
  })

  it('expires old events instead of leaving a fixed recap on screen', () => {
    const current = entities(entity('light.cucina', 'off', { friendly_name: 'Luce cucina' }))
    const changedAt = new Date('2026-07-18T14:00:00Z').getTime()
    const input = buildScreensaverRecapInput(current, new Date('2026-07-18T14:11:00Z'), [{
      entityId: 'light.cucina',
      name: 'Luce cucina',
      description: 'Luce cucina si è spenta',
      changedAt,
    }])

    expect(input.localText).not.toContain('Adesso:')
    expect(input.context.some((entry) => entry.entity_id.startsWith('sensor.recap_evento_'))).toBe(false)
  })
})
