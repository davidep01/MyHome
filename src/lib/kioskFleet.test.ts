import { describe, expect, it } from 'vitest'
import { kioskOfflineProblems } from './kioskFleet'

describe('kioskOfflineProblems', () => {
  const now = Date.parse('2026-11-27T18:00:00Z')
  it('segnala solo i tablet che non rispondono, con da quanto', () => {
    const problems = kioskOfflineProblems([
      { deviceId: 'a', name: 'Soggiorno', online: false, lastSeenAt: '2026-11-26T12:00:00Z' },
      { deviceId: 'b', online: true, lastSeenAt: '2026-11-27T17:59:30Z' },
    ], now)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ id: 'kiosk-offline:a', severity: 'warn', actionTarget: 'system' })
    expect(problems[0].text).toBe('Tablet «Soggiorno» non risponde da 1 g 6 h: controlla che sia acceso e che Fully apra la pagina /kiosk.')
  })

  it('senza nome né data non inventa nulla', () => {
    expect(kioskOfflineProblems([{ deviceId: 'x', online: false, lastSeenAt: '' }], now)[0].text)
      .toBe('Tablet a muro non risponde: controlla che sia acceso e che Fully apra la pagina /kiosk.')
  })
})
