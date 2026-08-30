import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { buildOfflineReport } from './offlineDevices'

function entity(entity_id: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id,
    state: 'unavailable',
    attributes,
    last_changed: '2026-08-30T20:00:00Z',
    last_updated: '2026-08-30T20:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }
}

const platforms: Record<string, string> = {
  'climate.cucina': 'netatmo',
  'camera.giardino': 'ezviz',
  'camera.entrata': 'ezviz',
  'light.sala': 'hue',
}

const lookups = {
  nameOf: (e: HassEntity) => String(e.attributes?.friendly_name ?? e.entity_id),
  platformOf: (id: string) => platforms[id],
  areaNameOf: (id: string) => (id.endsWith('cucina') ? 'Cucina' : undefined),
}

describe('offline report', () => {
  it('tiene fuori dai guasti la telemetria di sfondo, contandola a parte', () => {
    const report = buildOfflineReport([
      entity('climate.cucina', { friendly_name: 'Clima cucina' }),
      entity('device_tracker.wsbc004055255v_edb6'),
      entity('device_tracker.care_08fb'),
      entity('sensor.bluetooth_rssi', { device_class: 'signal_strength' }),
    ], lookups)

    expect(report.deviceCount).toBe(1)
    expect(report.backgroundCount).toBe(3)
    expect(report.integrations[0].entries[0]).toMatchObject({
      entityId: 'climate.cucina',
      name: 'Clima cucina',
      platform: 'netatmo',
      areaName: 'Cucina',
    })
  })

  it('mette per prima l integrazione che ha perso più dispositivi', () => {
    const report = buildOfflineReport([
      entity('light.sala', { friendly_name: 'Sala' }),
      entity('camera.giardino', { friendly_name: 'Giardino' }),
      entity('camera.entrata', { friendly_name: 'Entrata' }),
    ], lookups)

    expect(report.integrations.map((g) => [g.platform, g.entries.length])).toEqual([
      ['ezviz', 2],
      ['hue', 1],
    ])
    expect(report.integrations[0].entries.map((e) => e.name)).toEqual(['Entrata', 'Giardino'])
  })

  it('raccoglie sotto "Altro" ciò che il registry non attribuisce', () => {
    const report = buildOfflineReport([entity('lock.ignota', { friendly_name: 'Ignota' })], lookups)
    expect(report.integrations[0].platform).toBe('Altro')
  })

  it('ignora le entità già escluse dalle superfici utente', () => {
    const report = buildOfflineReport(
      [entity('climate.cucina', { friendly_name: 'Clima cucina' })],
      { ...lookups, excludedEntityIds: new Set(['climate.cucina']) },
    )
    expect(report).toMatchObject({ deviceCount: 0, backgroundCount: 0, integrations: [] })
  })

  it('non considera guasto ciò che è semplicemente acceso', () => {
    const online: HassEntity = { ...entity('light.sala'), state: 'on' }
    expect(buildOfflineReport([online], lookups).deviceCount).toBe(0)
  })
})
