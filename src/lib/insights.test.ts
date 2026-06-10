import { describe, expect, it } from 'vitest'
import { computeInsights, type InsightOptions } from './insights'
import type { ComposerEntity } from './composer'

const NOW = Date.parse('2026-06-10T15:00:00Z')

function e(id: string, state: string, attributes: Record<string, unknown> = {}, lastChangedMsAgo = 60 * 60 * 1000): ComposerEntity {
  return { entity_id: id, state, attributes, last_changed: new Date(NOW - lastChangedMsAgo).toISOString() }
}

const opts: InsightOptions = { nowMs: NOW }

describe('computeInsights', () => {
  it('luci accese e casa vuota da ≥30min → propone Spegni tutte', () => {
    const out = computeInsights([
      e('person.davide', 'not_home', {}, 45 * 60 * 1000),
      e('light.salotto', 'on'),
      e('light.cucina', 'on'),
    ], opts)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'lights-away',
      label: '2 luci accese e casa vuota',
      action: { domain: 'light', service: 'turn_off', entityIds: ['light.cucina', 'light.salotto'] },
    })
  })

  it('non scatta se qualcuno è in casa o se l\'assenza è recente', () => {
    expect(computeInsights([
      e('person.davide', 'home'),
      e('light.salotto', 'on'),
    ], opts)).toEqual([])

    expect(computeInsights([
      e('person.davide', 'not_home', {}, 10 * 60 * 1000), // via da soli 10min
      e('light.salotto', 'on'),
    ], opts)).toEqual([])
  })

  it('senza entità person non inventa nulla', () => {
    expect(computeInsights([e('light.salotto', 'on')], opts)).toEqual([])
  })

  it('finestra aperta + riscaldamento attivo nella stessa area → propone Spegni clima', () => {
    const areaIdOf = (id: string) => (id.includes('salotto') ? 'salotto' : undefined)
    const out = computeInsights([
      e('climate.salotto', 'heat', { hvac_action: 'heating' }),
      e('binary_sensor.finestra_salotto', 'on', { device_class: 'window' }),
    ], { ...opts, areaIdOf })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      label: 'Apertura aperta col riscaldamento acceso',
      action: { domain: 'climate', service: 'turn_off', entityIds: ['climate.salotto'] },
    })
  })

  it('aree diverse note → nessuna correlazione', () => {
    const areaIdOf = (id: string) => (id.includes('salotto') ? 'salotto' : 'camera')
    const out = computeInsights([
      e('climate.salotto', 'heat', { hvac_action: 'heating' }),
      e('binary_sensor.finestra_camera', 'on', { device_class: 'window' }),
    ], { ...opts, areaIdOf })
    expect(out).toEqual([])
  })

  it('clima idle non genera la chip', () => {
    const out = computeInsights([
      e('climate.salotto', 'heat', { hvac_action: 'idle' }),
      e('binary_sensor.finestra', 'on', { device_class: 'window' }),
    ], opts)
    expect(out).toEqual([])
  })
})
