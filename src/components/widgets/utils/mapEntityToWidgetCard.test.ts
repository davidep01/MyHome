import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import type { RoomEntity } from '../../../api/backend'
import { widgetTones } from './getRingColorScale'
import { mapEntityToWidgetCard } from './mapEntityToWidgetCard'

const roomEntity: RoomEntity = {
  id: 'light.cucina',
  roomId: 'cucina',
  entityId: 'light.cucina',
  label: 'Cucina',
  type: 'light',
  sortOrder: 0,
}

function light(state: 'on' | 'off', brightness?: number): HassEntity {
  return {
    entity_id: roomEntity.entityId,
    state,
    attributes: brightness === undefined ? {} : { brightness },
    last_changed: '2026-07-19T00:00:00Z',
    last_updated: '2026-07-19T00:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

describe('light widget mapping', () => {
  it('uses the warm functional color only while the light is on', () => {
    const mapped = mapEntityToWidgetCard(light('on', 128), roomEntity)

    expect(mapped).toMatchObject({
      family: 'light',
      status: 'on',
      isActive: true,
      accentColor: widgetTones.light.color,
      state: 'Accesa · 50%',
    })
  })

  it('uses the neutral gray tone while the light is off', () => {
    const mapped = mapEntityToWidgetCard(light('off'), roomEntity)

    expect(mapped).toMatchObject({
      family: 'light',
      status: 'off',
      isActive: false,
      accentColor: widgetTones.neutral.color,
      state: 'Spenta',
    })
  })
})

describe('safety widget mapping', () => {
  it('does not mislabel a generic problem sensor as a water leak', () => {
    const problemEntity: HassEntity = {
      entity_id: 'binary_sensor.gateway_problem',
      state: 'on',
      attributes: { device_class: 'problem', friendly_name: 'Gateway' },
      last_changed: '2026-07-19T00:00:00Z',
      last_updated: '2026-07-19T00:00:00Z',
      context: { id: 'test', parent_id: null, user_id: null },
    }
    const problemRoom: RoomEntity = {
      ...roomEntity,
      id: problemEntity.entity_id,
      entityId: problemEntity.entity_id,
      label: 'Gateway',
      type: 'binary_sensor',
    }

    expect(mapEntityToWidgetCard(problemEntity, problemRoom)).toMatchObject({
      family: 'system',
      state: 'Problema rilevato',
      isActive: true,
    })
  })
})

it('retains advertised artwork when a media player is switched off', () => {
  const entity = {...light('off'), entity_id: 'media_player.tv', attributes: {entity_picture: '/api/media_player_proxy/media_player.tv'}}
  expect(mapEntityToWidgetCard(entity, {...roomEntity, entityId: entity.entity_id}).artwork).toBe(entity.attributes.entity_picture)
})

describe('valori esatti', () => {
  it('non arrotonda i decimali riportati da Home Assistant', async () => {
    const { formatExact } = await import('./formatWidgetValue')
    expect(formatExact(0.99)).toBe('0,99')
    expect(formatExact(Number('21.50'), '21.50')).toBe('21,50')
    expect(formatExact(20)).toBe('20')
    expect(formatExact(0.1 + 0.2)).toBe('0,3')
  })

  it('la card sensore mostra 0,99 e non 1', () => {
    const sensor = { entity_id: 'sensor.consumo', state: '0.99', attributes: { unit_of_measurement: 'kWh', device_class: 'energy' }, last_changed: '', last_updated: '', context: { id: '', parent_id: null, user_id: null } } as HassEntity
    const mapped = mapEntityToWidgetCard(sensor, { ...roomEntity, id: 'sensor.consumo', entityId: 'sensor.consumo', label: 'Consumo', type: 'sensor' })
    expect(mapped.value).toBe('0,99')
  })
})
