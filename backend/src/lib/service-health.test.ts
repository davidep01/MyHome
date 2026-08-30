import { beforeEach, describe, expect, it } from 'vitest'
import {
  getBridgeHealth,
  getServiceErrors,
  recordBridgeDown,
  recordBridgeUp,
  recordServiceError,
  resetServiceHealth,
} from './service-health.js'
import { parseAddonVersion } from './update-check.js'

beforeEach(() => resetServiceHealth())

describe('bridge health', () => {
  it('conta una caduta sola per disconnessione, non una per segnalazione', () => {
    recordBridgeUp()
    expect(getBridgeHealth().connectedSince).not.toBeNull()

    // WS e poll segnalano entrambi la stessa caduta.
    recordBridgeDown('socket chiuso')
    recordBridgeDown('poll fallito')

    const health = getBridgeHealth()
    expect(health.disconnections).toBe(1)
    expect(health.connectedSince).toBeNull()
    expect(health.lastDisconnectReason).toBe('socket chiuso')
  })

  it('conta le riconnessioni successive', () => {
    recordBridgeUp()
    recordBridgeDown('primo')
    recordBridgeUp()
    recordBridgeDown('secondo')
    expect(getBridgeHealth().disconnections).toBe(2)
    expect(getBridgeHealth().lastDisconnectReason).toBe('secondo')
  })

  it('ignora una caduta se il ponte non era mai salito', () => {
    recordBridgeDown('mai connesso')
    expect(getBridgeHealth().disconnections).toBe(0)
  })
})

describe('service errors', () => {
  it('collassa errori consecutivi identici invece di riempire il buffer', () => {
    for (let i = 0; i < 40; i += 1) recordServiceError('ha', 'Home Assistant non raggiungibile')
    const entries = getServiceErrors()
    expect(entries).toHaveLength(1)
    expect(entries[0].count).toBe(40)
  })

  it('tiene distinti errori diversi, più recenti per primi', () => {
    recordServiceError('ha', 'primo')
    recordServiceError('storage', 'secondo')
    expect(getServiceErrors().map((e) => e.message)).toEqual(['secondo', 'primo'])
  })

  it('normalizza spazi e tronca messaggi lunghi', () => {
    recordServiceError('ha', `  a\n\nb  ${'x'.repeat(400)}`)
    const [entry] = getServiceErrors()
    expect(entry.message.startsWith('a b')).toBe(true)
    expect(entry.message.length).toBeLessThanOrEqual(200)
  })

  it('scarta un messaggio vuoto', () => {
    recordServiceError('ha', '   ')
    expect(getServiceErrors()).toEqual([])
  })
})

describe('update manifest', () => {
  it('legge la versione dal manifest dell add-on', () => {
    expect(parseAddonVersion('name: MyHome\nversion: "2.2.105"\nslug: myhome\n')).toBe('2.2.105')
    expect(parseAddonVersion('version: 2.3.0\n')).toBe('2.3.0')
  })

  it('non inventa una versione se il manifest non la espone', () => {
    expect(parseAddonVersion('name: MyHome\nslug: myhome\n')).toBeNull()
    expect(parseAddonVersion('version: latest\n')).toBeNull()
  })
})
