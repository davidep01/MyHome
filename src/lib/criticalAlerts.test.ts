import { describe, expect, it } from 'vitest'
import { deriveCriticalAlerts, type CriticalEntity } from './criticalAlerts'

function entity(entity_id: string, state: string, deviceClass?: string): CriticalEntity {
  return {
    entity_id,
    state,
    last_changed: '2026-07-14T20:00:00.000Z',
    attributes: { friendly_name: entity_id.split('.')[1], ...(deviceClass ? { device_class: deviceClass } : {}) },
  }
}

describe('deriveCriticalAlerts', () => {
  it('prioritizes intrusion, smoke and gas over water alerts', () => {
    const alerts = deriveCriticalAlerts({
      water: entity('binary_sensor.terrazzo', 'on', 'moisture'),
      smoke: entity('binary_sensor.cucina', 'on', 'smoke'),
      alarm: entity('alarm_control_panel.casa', 'triggered'),
    })
    expect(alerts.map((alert) => alert.kind)).toEqual(['intrusion', 'smoke', 'water'])
  })

  it('ignores inactive and non-critical motion sensors', () => {
    expect(deriveCriticalAlerts({
      motion: entity('binary_sensor.movimento', 'on', 'motion'),
      smoke: entity('binary_sensor.fumo', 'off', 'smoke'),
    })).toEqual([])
  })
})
