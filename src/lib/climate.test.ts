import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { formatClimateTemp, getClimateControls, getClimateVisualState } from './climate'

function entity(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: 'climate.test', state, attributes,
    context: { id: 'x', parent_id: null, user_id: null },
    last_changed: '', last_updated: '',
  }
}

describe('climate visual state', () => {
  it('non offre la regolazione temperatura quando HA dichiara la capability assente', () => {
    expect(getClimateControls(entity('heat', { temperature: 21, supported_features: 0 })).adjustable).toBe(false)
    expect(getClimateControls(entity('heat', { temperature: 21, supported_features: 1 })).adjustable).toBe(true)
    expect(getClimateControls(entity('heat', { temperature: 21 })).adjustable).toBe(true)
  })
  it('usa la modalità HVAC come tono quando il device non espone hvac_action', () => {
    const cool = getClimateVisualState(entity('cool'))
    expect(cool.tone).toBe('cooling')
    expect(cool.actionLabel).toBe('Modalità freddo')

    expect(getClimateVisualState(entity('heat')).tone).toBe('heating')
    expect(getClimateVisualState(entity('dry')).tone).toBe('drying')
    expect(getClimateVisualState(entity('fan_only')).tone).toBe('fan')
  })

  it('mantiene hvac_action come informazione più precisa della modalità', () => {
    const idle = getClimateVisualState(entity('cool', { hvac_action: 'idle' }))
    expect(idle.tone).toBe('cooling')
    expect(idle.actionLabel).toBe('In pausa')
  })

  it('formatta le temperature con la virgola italiana', () => {
    expect(formatClimateTemp(24.5)).toBe('24,5°C')
    expect(formatClimateTemp(undefined)).toBe('--°C')
    expect(formatClimateTemp(null)).toBe('--°C')
    expect(formatClimateTemp('')).toBe('--°C')
    expect(formatClimateTemp(77, '°F')).toBe('77,0°F')
  })
})
