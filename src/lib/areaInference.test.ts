import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import type { HAArea } from '../api/ha-registry'
import { inferAreaIdFromEntity, resolveAreaId } from './areaInference'

const areas: HAArea[] = [
  { area_id: 'soggiorno', name: 'Soggiorno' },
  { area_id: 'cucina', name: 'Cucina' },
  { area_id: 'camera_da_letto', name: 'Camera da letto' },
]

function entity(entityId: string, friendlyName: string): HassEntity {
  return {
    entity_id: entityId,
    state: 'on',
    attributes: { friendly_name: friendlyName },
    last_changed: '2026-08-30T12:00:00Z',
    last_updated: '2026-08-30T12:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

describe('area inference fallback', () => {
  it('uses the uniquely named room without reading the entity domain as a clue', () => {
    expect(inferAreaIdFromEntity(entity('light.camera_davide', 'Camera Davide'), areas)).toBe('camera_da_letto')
    expect(inferAreaIdFromEntity(entity('camera.entrata', 'Entrata'), areas)).toBeUndefined()
  })

  it('uses the room with the strongest repeated name signal', () => {
    expect(inferAreaIdFromEntity(
      entity('light.soggiorno_cucina_centrale_cucina', 'Soggiorno Cucina Centrale Cucina'),
      areas,
    )).toBe('cucina')
  })

  it('leaves a tie unassigned instead of guessing', () => {
    expect(inferAreaIdFromEntity(
      entity('light.soggiorno_cucina', 'Soggiorno Cucina'),
      areas,
    )).toBeUndefined()
  })

  it('gives a valid manual wizard assignment precedence over registry and inference', () => {
    expect(resolveAreaId({
      entity: entity('light.cucina', 'Luce cucina'),
      areas,
      registryAreaId: 'cucina',
      manualAreaId: 'soggiorno',
    })).toBe('soggiorno')
  })

  it('ignores a stale manual room and falls back to the registry', () => {
    expect(resolveAreaId({
      entity: entity('light.cucina', 'Luce cucina'),
      areas,
      registryAreaId: 'cucina',
      manualAreaId: 'stanza_eliminata',
    })).toBe('cucina')
  })
})
