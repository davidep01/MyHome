import { describe, expect, it } from 'vitest'
import { computeInsights, type InsightOptions } from './insights'
import type { ComposerEntity } from './composer'

const NOW = Date.parse('2026-06-10T15:00:00Z')

function e(id: string, state: string, attributes: Record<string, unknown> = {}, lastChangedMsAgo = 60 * 60 * 1000): ComposerEntity {
  return { entity_id: id, state, attributes, last_changed: new Date(NOW - lastChangedMsAgo).toISOString() }
}

const opts: InsightOptions = { nowMs: NOW }

describe('computeInsights', () => {
  it('non usa persone o tracker per dedurre che la casa sia vuota', () => {
    expect(computeInsights([
      e('person.davide', 'not_home', {}, 45 * 60 * 1000),
      e('device_tracker.telefono', 'not_home'),
      e('light.salotto', 'on'),
    ], opts)).toEqual([])
  })

  it('finestra aperta + riscaldamento attivo nella stessa area → propone Spegni clima', () => {
    const areaIdOf = (id: string) => (id.includes('salotto') ? 'salotto' : undefined)
    const out = computeInsights([
      e('climate.salotto', 'heat', { hvac_action: 'heating' }),
      e('binary_sensor.finestra_salotto', 'on', { device_class: 'window' }),
    ], { ...opts, areaIdOf })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      label: 'Porta o finestra aperta col riscaldamento acceso',
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
