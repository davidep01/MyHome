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
