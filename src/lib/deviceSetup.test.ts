import { describe, expect, it } from 'vitest'
import type { DeviceOverride } from '../api/backend'
import { applyDeviceSetup } from './deviceSetup'

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
    })
  })

  it('clears explicit category and room when automatic mode is selected', () => {
    expect(applyDeviceSetup(
      { type: 'camera', areaId: 'ingresso', enabled: true },
      { type: undefined, areaId: undefined },
    )).toEqual({ enabled: true })
  })
})
