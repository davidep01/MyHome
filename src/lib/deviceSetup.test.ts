import { describe, expect, it } from 'vitest'
import type { DeviceOverride } from '../api/backend'
import { applyVisibilitySelection, applyDeviceSetup, legacyConfiguredEntityIds } from './deviceSetup'

describe('device setup wizard override', () => {
  it('sets category and room without losing existing card configuration', () => {
    const current: DeviceOverride = {
      hero: 'always',
      label: 'Luce tavolo',
      cardSizes: ['M', 'XL'],
    }

    expect(applyDeviceSetup(current, { type: 'light', areaId: 'soggiorno' })).toEqual({
      hero: 'always',
      label: 'Luce tavolo',
      cardSizes: ['M', 'XL'],
      type: 'light',
      areaId: 'soggiorno',
      enabled: true,
    })
  })

  it('clears explicit category and room when automatic mode is selected', () => {
    expect(applyDeviceSetup(
      { type: 'camera', areaId: 'ingresso', enabled: true },
      { type: undefined, areaId: undefined },
    )).toEqual({ enabled: true })
  })
})

describe('visibilità opt-in dal wizard', () => {
  it('configurare un dispositivo lo rende visibile', () => {
    expect(applyDeviceSetup(undefined, { type: 'light', areaId: 'sala' })).toEqual({
      type: 'light', areaId: 'sala', enabled: true,
    })
  })

  it('conserva le altre preferenze della card', () => {
    expect(applyDeviceSetup({ cardSize: 'L', label: 'Sala' }, { type: 'light' })).toEqual({
      cardSize: 'L', label: 'Sala', type: 'light', enabled: true,
    })
  })

  it('attiva in blocco senza toccare il resto', () => {
    const next = applyVisibilitySelection(
      { 'light.sala': { cardSize: 'L' } },
      ['light.sala', 'switch.presa'],
      [],
    )
    expect(next).toEqual({
      'light.sala': { cardSize: 'L', enabled: true },
      'switch.presa': { enabled: true },
    })
  })

  it('disattivare rimuove la chiave, e l override vuoto sparisce del tutto', () => {
    const next = applyVisibilitySelection(
      { 'light.sala': { enabled: true, cardSize: 'L' }, 'switch.presa': { enabled: true } },
      [],
      ['light.sala', 'switch.presa', 'light.mai_vista'],
    )
    expect(next).toEqual({ 'light.sala': { cardSize: 'L' } })
  })
})

describe('legacyConfiguredEntityIds', () => {
  const exists = (id: string) => !id.includes('assente')
  const renderable = (id: string) => !id.startsWith('event.')
  it('propone solo i dispositivi configurati a mano ma mai attivati', () => {
    const result = legacyConfiguredEntityIds({
      'light.sala': { type: 'light', areaId: 'soggiorno' },
      'vacuum.robot': { areaId: 'soggiorno' },
      'sensor.rifiuti': { hero: 'always', label: 'Rifiuti' },
      'light.attiva': { enabled: true, type: 'light' },
      'camera.ingresso': { hero: 'always' },
      'light.mai': { hero: 'never', type: 'light' },
      'light.assente': { type: 'light' },
      'event.campanello': { label: 'Campanello' },
      'switch.nascosto': { type: 'lock' },
      'switch.vuoto': {},
    }, { exists, renderable, hidden: new Set(['switch.nascosto']) })
    expect(result).toEqual(['light.sala', 'sensor.rifiuti', 'vacuum.robot'])
  })
})

