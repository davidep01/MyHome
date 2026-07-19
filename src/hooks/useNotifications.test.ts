import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { notificationsFromEntities } from './useNotifications'

function entity(entityId: string, state: string, attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes,
    last_changed: '2026-07-19T12:00:00Z',
    last_updated: '2026-07-19T12:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

describe('live notifications', () => {
  it('uses natural Italian for an open door or window', () => {
    const opening = entity('binary_sensor.finestra_cucina', 'on', {
      device_class: 'window',
      friendly_name: 'Finestra cucina',
    })
    expect(notificationsFromEntities({ [opening.entity_id]: opening } as HassEntities)).toContainEqual({
      id: 'opening-binary_sensor.finestra_cucina',
      type: 'safety',
      title: 'Finestra cucina',
      message: 'Porta o finestra aperta',
      entityId: 'binary_sensor.finestra_cucina',
      severity: 'warning',
    })
  })

  it('removes the live notification when the opening closes', () => {
    const closed = entity('binary_sensor.finestra_cucina', 'off', { device_class: 'window' })
    expect(notificationsFromEntities({ [closed.entity_id]: closed } as HassEntities)).toEqual([])
  })
})
