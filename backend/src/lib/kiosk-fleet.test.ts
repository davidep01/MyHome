import { beforeEach, describe, expect, it } from 'vitest'
import {
  KIOSK_ONLINE_WINDOW_MS, listKioskDevices, parseKioskCommand, recordKioskHeartbeat, resetKioskFleet,
} from './kiosk-fleet.js'

beforeEach(() => resetKioskFleet())

describe('kiosk fleet heartbeat', () => {
  it('registra e lista con stato online', () => {
    expect(recordKioskHeartbeat({
      deviceId: 'tab-1',
      battery: 80,
      fully: 'available',
      nativeAudio: true,
      audioChannel: 'ready',
      audioPlaying: true,
    }, 1_000)).toBe(true)
    const devices = listKioskDevices(2_000)
    expect(devices).toHaveLength(1)
    expect(devices[0]).toMatchObject({
      deviceId: 'tab-1',
      battery: 80,
      fully: 'available',
      nativeAudio: true,
      audioChannel: 'ready',
      audioPlaying: true,
      online: true,
    })
  })

  it('marca offline oltre la finestra', () => {
    recordKioskHeartbeat({ deviceId: 'tab-1' }, 0)
    expect(listKioskDevices(KIOSK_ONLINE_WINDOW_MS + 1)[0].online).toBe(false)
  })

  it('rifiuta deviceId malformati', () => {
    expect(recordKioskHeartbeat({ deviceId: '../etc' })).toBe(false)
    expect(recordKioskHeartbeat({ deviceId: '' })).toBe(false)
  })

  it('scarta il dispositivo più stantio oltre il limite', () => {
    for (let i = 0; i < 20; i += 1) recordKioskHeartbeat({ deviceId: `tab-${i}` }, i)
    recordKioskHeartbeat({ deviceId: 'nuovo' }, 100)
    const ids = listKioskDevices(100).map((d) => d.deviceId)
    expect(ids).toContain('nuovo')
    expect(ids).not.toContain('tab-0')
    expect(ids).toHaveLength(20)
  })
})

describe('parseKioskCommand', () => {
  it('accetta i comandi semplici', () => {
    expect(parseKioskCommand({ target: 'all', command: 'reload' })).toEqual({ target: 'all', command: 'reload' })
    expect(parseKioskCommand({ target: 'tab-1', command: 'screenOff' })).toEqual({ target: 'tab-1', command: 'screenOff' })
    expect(parseKioskCommand({ target: 'tab-1', command: 'audioTest' })).toEqual({ target: 'tab-1', command: 'audioTest' })
  })

  it('valida brightness', () => {
    expect(parseKioskCommand({ target: 'all', command: 'brightness', value: 128 })).toEqual({ target: 'all', command: 'brightness', value: 128 })
    expect(parseKioskCommand({ target: 'all', command: 'brightness', value: 300 })).toBeNull()
    expect(parseKioskCommand({ target: 'all', command: 'brightness' })).toBeNull()
  })

  it('valida e ripulisce say', () => {
    expect(parseKioskCommand({ target: 'all', command: 'say', value: ' Cena pronta! ' })).toEqual({ target: 'all', command: 'say', value: 'Cena pronta!' })
    expect(parseKioskCommand({ target: 'all', command: 'say', value: '' })).toBeNull()
    expect(parseKioskCommand({ target: 'all', command: 'say', value: 'x'.repeat(201) })).toBeNull()
  })

  it('rifiuta comandi ignoti, target malformati e value inattesi', () => {
    expect(parseKioskCommand({ target: 'all', command: 'formatDisk' })).toBeNull()
    expect(parseKioskCommand({ target: '../x', command: 'reload' })).toBeNull()
    expect(parseKioskCommand({ target: 'all', command: 'reload', value: 1 })).toBeNull()
    expect(parseKioskCommand(null)).toBeNull()
  })
})
