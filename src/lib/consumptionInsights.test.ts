import { describe, expect, it } from 'vitest'
import {
  detectSolarSelfSufficiency, detectSustainedWaterFlow, findSolarProductionSensor, findWaterFlowSensor,
  WATER_FLOW_THRESHOLD_L_PER_MIN, WATER_FLOW_WINDOW_MINUTES,
} from './consumptionInsights'

const NOW = Date.parse('2026-06-10T15:00:00Z')

function point(value: number, minutesAgo: number) {
  return { state: String(value), last_changed: new Date(NOW - minutesAgo * 60_000).toISOString(), last_updated: new Date(NOW - minutesAgo * 60_000).toISOString() }
}

describe('findWaterFlowSensor', () => {
  it('finds a rate-unit water sensor by device_class', () => {
    const found = findWaterFlowSensor([
      { entity_id: 'sensor.portata_cucina', state: '3', attributes: { device_class: 'water', unit_of_measurement: 'L/min' } },
    ])
    expect(found).toEqual({ entityId: 'sensor.portata_cucina', name: 'sensor.portata_cucina', unit: 'L/min' })
  })

  it('finds a rate-unit water sensor by keyword when device_class is absent', () => {
    const found = findWaterFlowSensor([
      { entity_id: 'sensor.acqua_flow', state: '3', attributes: { unit_of_measurement: 'm³/h' }, },
    ])
    expect(found?.entityId).toBe('sensor.acqua_flow')
  })

  it('ignores a cumulative-meter water sensor (no rate unit)', () => {
    const found = findWaterFlowSensor([
      { entity_id: 'sensor.acqua_totale', state: '1200', attributes: { device_class: 'water', unit_of_measurement: 'L' } },
    ])
    expect(found).toBeNull()
  })

  it('ignores unavailable and non-numeric candidates', () => {
    expect(findWaterFlowSensor([{ entity_id: 'sensor.acqua_flow', state: 'unavailable', attributes: { unit_of_measurement: 'L/min' } }])).toBeNull()
  })

  it('returns null when no candidate exists', () => {
    expect(findWaterFlowSensor([{ entity_id: 'sensor.temperatura', state: '21', attributes: {} }])).toBeNull()
  })
})

describe('detectSustainedWaterFlow', () => {
  it('flags a sustained flow above threshold across the whole window', () => {
    const points = [point(3, 25), point(2.5, 15), point(4, 5)]
    const insight = detectSustainedWaterFlow(points, 'L/min', NOW)
    expect(insight).toMatchObject({ id: 'water-sustained-flow', severity: 'warn' })
    expect(insight?.text).toContain(`${WATER_FLOW_WINDOW_MINUTES}`)
  })

  it('does not flag a spike that drops back down', () => {
    const points = [point(5, 25), point(0.1, 15), point(5, 5)]
    expect(detectSustainedWaterFlow(points, 'L/min', NOW)).toBeNull()
  })

  it('does not flag when below threshold', () => {
    const points = [point(1, 25), point(1, 15), point(1, 5)]
    expect(detectSustainedWaterFlow(points, 'L/min', NOW)).toBeNull()
  })

  it('requires a minimum number of samples in the window', () => {
    const points = [point(5, 5)]
    expect(detectSustainedWaterFlow(points, 'L/min', NOW)).toBeNull()
  })

  it('ignores samples outside the window', () => {
    const points = [point(5, 500), point(5, 400)]
    expect(detectSustainedWaterFlow(points, 'L/min', NOW)).toBeNull()
  })

  it('normalizes m³/h to L/min before comparing to the threshold', () => {
    // 5 m3/h = 5000 L / 60 min ≈ 83.3 L/min, well above threshold
    const points = [point(5, 25), point(5, 15), point(5, 5)]
    const insight = detectSustainedWaterFlow(points, 'm³/h', NOW)
    expect(insight).not.toBeNull()
  })

  it('flow exactly at the threshold is not "sustained above" it', () => {
    const points = [point(WATER_FLOW_THRESHOLD_L_PER_MIN, 25), point(WATER_FLOW_THRESHOLD_L_PER_MIN, 15), point(WATER_FLOW_THRESHOLD_L_PER_MIN, 5)]
    expect(detectSustainedWaterFlow(points, 'L/min', NOW)).toBeNull()
  })
})

describe('findSolarProductionSensor', () => {
  it('finds the most-active solar power sensor by keyword', () => {
    const found = findSolarProductionSensor([
      { entity_id: 'sensor.potenza_solare', state: '2500', attributes: { device_class: 'power', unit_of_measurement: 'W' } },
      { entity_id: 'sensor.potenza_forno', state: '1800', attributes: { device_class: 'power', unit_of_measurement: 'W' } },
    ])
    expect(found).toEqual({ entityId: 'sensor.potenza_solare', kw: 2.5 })
  })

  it('returns null with no solar-keyword power sensor', () => {
    expect(findSolarProductionSensor([{ entity_id: 'sensor.potenza_forno', state: '1800', attributes: { device_class: 'power', unit_of_measurement: 'W' } }])).toBeNull()
  })
})

describe('detectSolarSelfSufficiency', () => {
  it('flags when solar production covers current consumption', () => {
    expect(detectSolarSelfSufficiency(2.4, 2.5)).toMatchObject({ id: 'solar-self-sufficiency', severity: 'info' })
  })

  it('does not flag when solar falls meaningfully short of consumption', () => {
    expect(detectSolarSelfSufficiency(3, 1)).toBeNull()
  })

  it('does not flag negligible consumption (near-zero baseline)', () => {
    expect(detectSolarSelfSufficiency(0.02, 0.5)).toBeNull()
  })
})
