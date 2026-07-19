import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { energyWindowAt, formatHousePower, formatPowerKw, isEnergyRisk, isWallboxConnected, powerInKw, totalPowerInKw, wallboxMode } from './statusBarEnergy'

function entity(state: string, unit?: string): HassEntity {
  return {
    entity_id: 'sensor.test',
    state,
    attributes: unit ? { unit_of_measurement: unit } : {},
    last_changed: '',
    last_updated: '',
    context: { id: '', parent_id: null, user_id: null },
  }
}

describe('status bar energy', () => {
  it('shows the wallbox only for connected charging states', () => {
    expect(isWallboxConnected(entity('CONNECTED'))).toBe(true)
    expect(isWallboxConnected(entity('charging'))).toBe(true)
    expect(isWallboxConnected(entity('DISCONNECTED'))).toBe(false)
    expect(isWallboxConnected(entity('unavailable'))).toBe(false)
  })

  it('distinguishes a static connected car from active charging', () => {
    expect(wallboxMode(entity('CONNECTED'))).toBe('connected')
    expect(wallboxMode(entity('CHARGING'))).toBe('charging')
    expect(wallboxMode(entity('Suspended EVSE'))).toBe('connected')
    expect(wallboxMode(entity('NOT CHARGING'))).toBe('connected')
    expect(wallboxMode(entity('NOT_CONNECTED'))).toBe('hidden')
  })

  it('formats live house consumption using the source unit', () => {
    expect(formatHousePower(entity('0.21', 'kW'))).toBe('0,21 kW')
    expect(formatHousePower(entity('1.234', 'kW'))).toBe('1,23 kW')
    expect(formatHousePower(entity('1540', 'W'))).toBe('1,54 kW')
    expect(formatHousePower(entity('unavailable', 'kW'))).toBeNull()
    expect(powerInKw(entity('1540', 'W'))).toBe(1.54)
  })

  it('sums house and car power for the contractual load', () => {
    expect(totalPowerInKw(entity('0.18', 'kW'), entity('5.37', 'kW'))).toBeCloseTo(5.55)
    expect(formatPowerKw(totalPowerInKw(entity('180', 'W'), entity('5370', 'W')))).toBe('5,55 kW')
    expect(totalPowerInKw(entity('unavailable', 'kW'), entity('5.37', 'kW'))).toBe(5.37)
    expect(totalPowerInKw(entity('unavailable', 'kW'), undefined)).toBeNull()
  })

  it('uses 3 kW on weekday daytime and 6 kW at night or on holidays', () => {
    expect(energyWindowAt(new Date('2026-07-20T10:00:00+02:00'))).toMatchObject({ limitKw: 3, warningKw: 2.5 })
    expect(energyWindowAt(new Date('2026-07-20T23:30:00+02:00'))).toMatchObject({ limitKw: 6, warningKw: 5.5 })
    expect(energyWindowAt(new Date('2026-07-19T10:00:00+02:00'))).toMatchObject({ limitKw: 6 })
    expect(energyWindowAt(new Date('2026-12-25T10:00:00+01:00'))).toMatchObject({ limitKw: 6, label: 'Festivo · soglia estesa' })
    expect(energyWindowAt(new Date('2026-04-06T10:00:00+02:00'))).toMatchObject({ limitKw: 6, label: 'Festivo · soglia estesa' })
  })

  it('starts the warning at 2.5 or 5.5 kW for the active window', () => {
    expect(isEnergyRisk(2.49, energyWindowAt(new Date('2026-07-20T10:00:00+02:00')))).toBe(false)
    expect(isEnergyRisk(2.5, energyWindowAt(new Date('2026-07-20T10:00:00+02:00')))).toBe(true)
    expect(isEnergyRisk(5.49, energyWindowAt(new Date('2026-07-19T10:00:00+02:00')))).toBe(false)
    expect(isEnergyRisk(5.5, energyWindowAt(new Date('2026-07-19T10:00:00+02:00')))).toBe(true)
  })
})
