import { describe, expect, it } from 'vitest'
import { commandNeedsFully, commandResultLabel, fleetReadiness } from './kioskCommands'

describe('comandi remoti al tablet', () => {
  it('sa quali comandi vivono nel browser e quali richiedono Fully', () => {
    // Sono esattamente i due che "funzionavano" quando Fully manca.
    expect(commandNeedsFully('reload')).toBe(false)
    expect(commandNeedsFully('audioTest')).toBe(false)
    for (const command of ['screenOn', 'screenOff', 'say', 'screensaverStart', 'restart']) {
      expect(commandNeedsFully(command)).toBe(true)
    }
  })

  it('distingue interfaccia spenta e origine non fidata', () => {
    expect(fleetReadiness({ fully: 'available' })).toEqual({ canRunAll: true })
    const unavailable = fleetReadiness({ fully: 'unavailable' })
    expect(unavailable.canRunAll).toBe(false)
    expect(unavailable.canRunAll === false && unavailable.reason).toContain('Enable JavaScript Interface')
    const blocked = fleetReadiness({ fully: 'blocked' })
    expect(blocked.canRunAll === false && blocked.reason).toContain('IP della LAN')
  })

  it('non dà per buono uno stato che il tablet non ha ancora riportato', () => {
    const unknown = fleetReadiness({})
    expect(unknown.canRunAll).toBe(false)
  })

  it('spiega l esito invece di dichiarare un successo generico', () => {
    expect(commandResultLabel({ ok: true, command: 'screenOff' })).toContain('eseguito sul tablet')
    expect(commandResultLabel({ ok: false, reason: 'no-bridge', command: 'say' }))
      .toContain('Fully Kiosk non raggiungibile')
    expect(commandResultLabel({ ok: false, reason: 'unsupported', command: 'restart' }))
      .toContain('non lo supporta')
  })
})
