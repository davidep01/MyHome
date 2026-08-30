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

  it('does not turn diagnostic or background availability into user alerts', () => {
    const diagnostic = entity('climate.tecnico', 'unavailable', { friendly_name: 'Clima tecnico' })
    const tracker = entity('device_tracker.telefono', 'unavailable', { friendly_name: 'Telefono' })
    const notifications = notificationsFromEntities({
      [diagnostic.entity_id]: diagnostic,
      [tracker.entity_id]: tracker,
    } as HassEntities, { excludedEntityIds: new Set([diagnostic.entity_id]) })

    expect(notifications).toEqual([])
  })

  it('keeps an unavailable controllable device actionable', () => {
    const siren = entity('siren.giardino', 'unavailable', { friendly_name: 'Sirena giardino' })
    expect(notificationsFromEntities({ [siren.entity_id]: siren } as HassEntities)).toContainEqual({
      id: 'offline-siren.giardino',
      type: 'offline',
      title: 'Sirena giardino offline',
      message: 'Dispositivo non raggiungibile',
      entityId: 'siren.giardino',
      severity: 'warning',
    })
  })

  it('keeps a low battery proactive even when HA classifies its sensor as diagnostic', () => {
    const battery = entity('sensor.porta_battery', '9', {
      device_class: 'battery',
      friendly_name: 'Batteria porta',
      unit_of_measurement: '%',
    })
    expect(notificationsFromEntities(
      { [battery.entity_id]: battery } as HassEntities,
      { excludedEntityIds: new Set([battery.entity_id]) },
    )).toContainEqual({
      id: 'battery-sensor.porta_battery',
      type: 'battery',
      title: 'Batteria porta — batteria bassa',
      message: '9% rimanente',
      entityId: 'sensor.porta_battery',
      severity: 'critical',
    })
  })
})
