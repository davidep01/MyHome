import { describe, expect, it } from 'vitest'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import {
  isPresenceEntity,
  externalTemperatureFromEntities,
  indoorClimateTemperatureSources,
  meanIndoorClimateTemperature,
  selectDashboardCameraIds,
  selectRoomDashboardIds,
} from './dashboardSelection'

function entity(id: string, state = 'off', attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id: id, state, attributes, context: { id: 'x', parent_id: null, user_id: null }, last_changed: '', last_updated: '' }
}

function entities(...items: HassEntity[]): HassEntities {
  return Object.fromEntries(items.map((item) => [item.entity_id, item]))
}

describe('dashboard selection', () => {
  it('esclude null e converte unità prima delle medie', () => {
    expect(meanIndoorClimateTemperature(entities(entity('climate.null', 'heat', { current_temperature: null })))).toBeNull()
    expect(meanIndoorClimateTemperature(entities(entity('climate.fahrenheit', 'heat', { current_temperature: 68, temperature_unit: '°F' }), entity('climate.celsius', 'heat', { current_temperature: 20, temperature_unit: '°C' })))).toBe(20)
    expect(externalTemperatureFromEntities(entities(entity('weather.null', 'sunny', { temperature: null })))).toBeNull()
  })
  it('calcola la media interna dai climate disponibili', () => {
    const source = entities(
      entity('climate.sala', 'heat', { current_temperature: 20 }),
      entity('climate.camera', 'heat', { current_temperature: 22 }),
      entity('climate.offline', 'unavailable', { current_temperature: 99 }),
    )
    expect(meanIndoorClimateTemperature(source)).toBe(21)
    expect(indoorClimateTemperatureSources(source)).toEqual([
      { entityId: 'climate.camera', label: 'climate.camera', value: 22 },
      { entityId: 'climate.sala', label: 'climate.sala', value: 20 },
    ])
  })

  it('usa weather o il sensore esterno come fallback meteo', () => {
    expect(externalTemperatureFromEntities(entities(
      entity('sensor.temperatura_esterna', '17.5', { device_class: 'temperature' }),
      entity('weather.casa', 'sunny', { temperature: 18.2 }),
    ))).toBe(18.2)
    expect(externalTemperatureFromEntities(entities(
      entity('sensor.temperatura_esterna', '17.5', { device_class: 'temperature' }),
    ))).toBe(17.5)
  })

  it('mette camere preferite e live view nella fila video stabile', () => {
    const source = entities(
      entity('camera.porta_snapshot'),
      entity('camera.giardino_live_view'),
      entity('camera.entrata_live_view'),
      entity('camera.garage'),
    )
    const overrides = Object.fromEntries(
      Object.keys(source).map((id) => [id, { enabled: true }]),
    )
    expect(selectDashboardCameraIds(source, {
      preferredEntityIds: ['camera.entrata_live_view'],
      overrides,
      limit: 3,
    })).toEqual(['camera.entrata_live_view', 'camera.giardino_live_view', 'camera.garage'])
  })

  it('la tendina video mostra solo le camere configurate nel wizard', () => {
    const source = entities(
      entity('camera.giardino_live_view'),
      entity('camera.entrata_live_view'),
    )
    // Nessun override: nessuno stream montato, nemmeno aprendo la tendina.
    expect(selectDashboardCameraIds(source, { limit: 3 })).toEqual([])
    expect(selectDashboardCameraIds(source, {
      overrides: { 'camera.entrata_live_view': { enabled: true } },
      limit: 3,
    })).toEqual(['camera.entrata_live_view'])
  })

  it('includes active-doorbell cameras without a wizard enabled flag', () => {
    const source = entities(entity('camera.entrata_live_view', 'idle'), entity('camera.giardino_live_view', 'idle'), entity('camera.entrata_snapshot', 'idle'))
    expect(selectDashboardCameraIds(source, {
      preferredEntityIds: ['camera.entrata_live_view', 'camera.giardino_live_view'],
      overrides: { 'camera.entrata_live_view': { icon: 'Video' } },
    })).toEqual(['camera.entrata_live_view', 'camera.giardino_live_view'])
  })

  it('respects explicit disabled and hidden settings even for doorbell cameras', () => {
    const source = entities(entity('camera.entrata_live_view'), entity('camera.giardino_live_view'))
    expect(selectDashboardCameraIds(source, {
      preferredEntityIds: Object.keys(source),
      overrides: { 'camera.entrata_live_view': { enabled: false } },
      hiddenEntities: ['camera.giardino_live_view'],
    })).toEqual([])
  })

  it('does not synthesize missing cameras or bypass the room allowlist', () => {
    const source = entities(entity('camera.entrata_live_view'))
    expect(selectDashboardCameraIds(source, {
      preferredEntityIds: ['camera.entrata_live_view', 'camera.missing'], allowedEntityIds: ['camera.missing'],
    })).toEqual([])
  })

  it('esclude ogni entità di presenza dalla dashboard stanza', () => {
    const source = entities(
      entity('person.davide', 'home'),
      entity('device_tracker.telefono', 'home'),
      entity('binary_sensor.movimento', 'on', { device_class: 'motion' }),
      entity('light.sala', 'on'),
      entity('climate.sala', 'heat'),
    )
    expect(isPresenceEntity(source['binary_sensor.movimento'])).toBe(true)
    expect(selectRoomDashboardIds(Object.keys(source), source)).toEqual(['light.sala', 'climate.sala'])
  })
})
