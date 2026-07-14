import { describe, expect, it } from 'vitest'
import {
  groupCapability,
  groupMemberActive,
  homogeneousGroupDomain,
  optimisticGroupState,
} from './groupActions'

describe('group actions', () => {
  it('allows commands only for homogeneous domains', () => {
    expect(homogeneousGroupDomain(['cover.a', 'cover.b'])).toBe('cover')
    expect(homogeneousGroupDomain(['light.a', 'switch.b'])).toBeNull()
    expect(homogeneousGroupDomain([])).toBeNull()
  })

  it('uses each Home Assistant domain service instead of a generic proxy', () => {
    expect(groupCapability('cover')).toMatchObject({ onService: 'open_cover', offService: 'close_cover' })
    expect(groupCapability('siren')).toMatchObject({ onService: 'turn_on', offService: 'turn_off', holdToActivate: true })
    expect(groupCapability('water_heater')).toMatchObject({ onService: 'turn_on', offService: 'turn_off' })
    expect(groupCapability('input_button')).toMatchObject({ kind: 'activate', onService: 'press' })
    expect(groupCapability('sensor')).toBeNull()
  })

  it('models active and optimistic states by domain', () => {
    expect(groupMemberActive('cover', 'opening')).toBe(true)
    expect(groupMemberActive('climate', 'heat')).toBe(true)
    expect(groupMemberActive('media_player', 'idle')).toBe(true)
    expect(optimisticGroupState('cover', false)).toBe('closing')
    expect(optimisticGroupState('water_heater', true)).toBeUndefined()
  })
})
