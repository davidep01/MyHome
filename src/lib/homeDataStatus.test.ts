import { describe, expect, it } from 'vitest'
import { homeDataStatus } from './homeDataStatus'
describe('home data status', () => {
  it('does not reassure at boot without HA data', () => {
    expect(homeDataStatus('idle', 0)?.detail).toContain('In attesa')
    expect(homeDataStatus('connected', 0)?.label).toBe('Nessun dato disponibile')
  })
  it('distinguishes stale cached data from an online snapshot', () => {
    expect(homeDataStatus('error', 12)?.detail).toContain('Ultimi dati noti')
    expect(homeDataStatus('connected', 12)).toBeNull()
  })
})
