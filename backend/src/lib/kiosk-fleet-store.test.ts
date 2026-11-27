import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KIOSK_FORGET_AFTER_MS, KIOSK_ONLINE_WINDOW_MS, listKioskDevices, recordKioskHeartbeat, resetKioskFleet, restoreKioskFleet } from './kiosk-fleet.js'
import { ensureKioskFleetLoaded, KIOSK_PERSIST_INTERVAL_MS, kioskFleetPath, persistKioskFleetIfNeeded, resetKioskFleetStore } from './kiosk-fleet-store.js'

const NOW = 1_800_000_000_000
const env = (path: string) => ({ MYHOME_KIOSK_FLEET_PATH: path, NODE_ENV: 'test' }) as NodeJS.ProcessEnv

describe('memoria dei tablet conosciuti', () => {
  let dir = ''
  let path = ''
  beforeEach(() => {
    resetKioskFleet()
    resetKioskFleetStore()
    dir = mkdtempSync(join(tmpdir(), 'kiosk-fleet-'))
    path = join(dir, 'kiosk-devices.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('dopo un riavvio il tablet resta in elenco come offline, con il suo ultimo contatto', () => {
    recordKioskHeartbeat({ deviceId: 'tablet-soggiorno', name: 'Soggiorno', battery: 80 }, NOW)
    expect(persistKioskFleetIfNeeded(path, NOW, env(path))).toBe(true)

    resetKioskFleet() // riavvio del servizio
    resetKioskFleetStore()
    const later = NOW + 30 * 60 * 60_000
    ensureKioskFleetLoaded(path, later)
    const [device] = listKioskDevices(later)
    expect(device).toMatchObject({ deviceId: 'tablet-soggiorno', name: 'Soggiorno', online: false, lastSeenAt: new Date(NOW).toISOString() })
    expect(device.battery).toBeUndefined() // lo stato vivo non si ricorda: sarebbe un dato vecchio spacciato per attuale
  })

  it('un heartbeat dopo il riavvio lo rimette online', () => {
    restoreKioskFleet([{ deviceId: 'tablet-soggiorno', lastSeen: NOW - 1000 }], NOW)
    recordKioskHeartbeat({ deviceId: 'tablet-soggiorno' }, NOW + 10)
    expect(listKioskDevices(NOW + 20)[0].online).toBe(true)
  })

  it('scrive solo per un tablet nuovo o dopo 10 minuti, mai in sola lettura', () => {
    recordKioskHeartbeat({ deviceId: 'a' }, NOW)
    expect(persistKioskFleetIfNeeded(path, NOW, env(path))).toBe(true)
    recordKioskHeartbeat({ deviceId: 'a' }, NOW + 60_000)
    expect(persistKioskFleetIfNeeded(path, NOW + 60_000, env(path))).toBe(false)
    expect(persistKioskFleetIfNeeded(path, NOW + KIOSK_PERSIST_INTERVAL_MS, env(path))).toBe(true)
    recordKioskHeartbeat({ deviceId: 'b' }, NOW + KIOSK_PERSIST_INTERVAL_MS + 1)
    expect(persistKioskFleetIfNeeded(path, NOW + KIOSK_PERSIST_INTERVAL_MS + 1, { ...env(path), MYHOME_READ_ONLY: 'true' })).toBe(false)
    expect(JSON.parse(readFileSync(path, 'utf8')).devices.map((d: { deviceId: string }) => d.deviceId)).toEqual(['a'])
  })

  it('scarta voci malformate, future o dimenticate e un file corrotto non blocca nulla', () => {
    expect(restoreKioskFleet([
      { deviceId: 'ok', lastSeen: NOW - KIOSK_ONLINE_WINDOW_MS * 2 },
      { deviceId: 'vecchio', lastSeen: NOW - KIOSK_FORGET_AFTER_MS - 1 },
      { deviceId: 'futuro', lastSeen: NOW + 1 },
      { deviceId: '../x', lastSeen: NOW },
      'spazzatura',
    ], NOW)).toBe(1)
    resetKioskFleet()
    writeFileSync(path, '{non json')
    expect(() => ensureKioskFleetLoaded(path, NOW)).not.toThrow()
    expect(listKioskDevices(NOW)).toEqual([])
  })

  it('il file sta accanto al database', () => {
    expect(kioskFleetPath({ MYHOME_DB_PATH: '/data/db.json' } as NodeJS.ProcessEnv)).toBe('/data/kiosk-devices.json')
  })
})
