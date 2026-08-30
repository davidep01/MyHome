import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import type { HAEntityReg } from '../api/ha-registry'
import {
  dashboardExcludedEntityIds,
  duplicateSwitchProxyEntityIds,
  isRelevantUnavailableEntity,
} from './entityCuration'

function registry(entityId: string, patch: Partial<HAEntityReg> = {}): HAEntityReg {
  return {
    entity_id: entityId,
    area_id: null,
    device_id: null,
    hidden_by: null,
    platform: 'test',
    entity_category: null,
    ...patch,
  }
}

function entity(entityId: string, deviceClass?: string): HassEntity {
  return {
    entity_id: entityId,
    state: 'unavailable',
    attributes: deviceClass ? { device_class: deviceClass } : {},
    last_changed: '2026-08-30T12:00:00Z',
    last_updated: '2026-08-30T12:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

describe('dashboard entity curation', () => {
  it('excludes HA-hidden, disabled, config and diagnostic registry entities', () => {
    const excluded = dashboardExcludedEntityIds([
      registry('light.cucina'),
      registry('switch.motion_detection', { entity_category: 'config' }),
      registry('sensor.rssi', { entity_category: 'diagnostic' }),
      registry('sensor.hidden', { hidden_by: 'user' }),
      registry('sensor.disabled', { disabled_by: 'integration' }),
    ])

    expect([...excluded].sort()).toEqual([
      'sensor.disabled',
      'sensor.hidden',
      'sensor.rssi',
      'switch.motion_detection',
    ])
  })

  it('keeps camera integration settings out of standalone kiosk cards', () => {
    const excluded = dashboardExcludedEntityIds([
      registry('switch.entrata_motion_detection', { platform: 'ring' }),
      registry('switch.giardino_cam_audio', { platform: 'ezviz' }),
      registry('switch.cancello', { platform: 'shelly' }),
    ])

    expect([...excluded].sort()).toEqual([
      'switch.entrata_motion_detection',
      'switch.giardino_cam_audio',
    ])
  })

  it('prefers a semantic light over its duplicate relay switch', () => {
    const semanticLight = entity('light.centrale')
    semanticLight.state = 'on'
    semanticLight.attributes.friendly_name = 'Centrale cucina'
    const relay = entity('switch.sonoff_relay_2')
    relay.state = 'on'
    relay.attributes.friendly_name = 'Centrale cucina'
    const realSwitch = entity('switch.cancello')
    realSwitch.state = 'off'
    realSwitch.attributes.friendly_name = 'Cancello'

    expect([...duplicateSwitchProxyEntityIds({
      [semanticLight.entity_id]: semanticLight,
      [relay.entity_id]: relay,
      [realSwitch.entity_id]: realSwitch,
    })]).toEqual(['switch.sonoff_relay_2'])
  })

  it('treats only user-relevant device domains as offline problems', () => {
    expect(isRelevantUnavailableEntity(entity('climate.soggiorno'))).toBe(true)
    expect(isRelevantUnavailableEntity(entity('binary_sensor.porta', 'door'))).toBe(true)
    expect(isRelevantUnavailableEntity(entity('sensor.bluetooth_distance', 'distance'))).toBe(false)
    expect(isRelevantUnavailableEntity(entity('device_tracker.telefono'))).toBe(false)
  })
})
