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
