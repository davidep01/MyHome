import { createFullyKioskBridge } from './fullyKiosk'
import { testKioskAlarmChannel } from './sound/KioskAlarmChannel'
import { uid } from './uid'

const DEVICE_ID_KEY = 'myhome.kioskDeviceId'

/** Identità stabile del tablet: l'ID Fully quando c'è, altrimenti un uid persistito. */
export function getKioskDeviceId(): string {
  const bridge = createFullyKioskBridge(window.fully, window.location)
  const fullyId = bridge?.getDeviceId()
  if (fullyId && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(fullyId)) return fullyId
  let stored = localStorage.getItem(DEVICE_ID_KEY)
  if (!stored) {
    stored = uid('kiosk')
    localStorage.setItem(DEVICE_ID_KEY, stored)
  }
  return stored
}

export type KioskCommandName = 'reload' | 'screenOn' | 'screenOff' | 'brightness' | 'say' | 'screensaverStart' | 'screensaverStop' | 'audioTest' | 'restart'

export type KioskCommandOutcome =
  | { ok: true }
  /** Fully non è raggiungibile: interfaccia JavaScript spenta o origine non fidata. */
  | { ok: false; reason: 'no-bridge' }
  /** Fully c'è ma questa versione non espone la funzione. */
  | { ok: false; reason: 'unsupported' }

/**
 * Esegue un comando dalla regia (§4.5/§12) sul tablet corrente via Fully.
 *
 * `reload` e `audioTest` vivono nel browser e funzionano sempre: è il motivo
 * per cui erano gli unici a "funzionare" quando Fully non è disponibile,
 * mentre tutti gli altri fallivano in silenzio. Ora l'esito torna al
 * chiamante, che lo riferisce alla regia.
 */
export function executeKioskCommand(
  command: KioskCommandName,
  value?: number | string,
): KioskCommandOutcome {
  if (command === 'reload') {
    window.location.reload()
    return { ok: true }
  }
  if (command === 'audioTest') {
    testKioskAlarmChannel()
    return { ok: true }
  }
  const bridge = createFullyKioskBridge(window.fully, window.location)
  if (!bridge) return { ok: false, reason: 'no-bridge' }
  const done = (() => {
    switch (command) {
      case 'screenOn': return bridge.turnScreenOn()
      case 'screenOff': return bridge.turnScreenOff()
      case 'brightness': return typeof value === 'number' ? bridge.setBrightness(value) : false
      case 'say': return typeof value === 'string' ? bridge.say(value) : false
      case 'screensaverStart': return bridge.startScreensaver()
      case 'screensaverStop': return bridge.stopScreensaver()
      case 'restart': return bridge.restartApp()
      default: return false
    }
  })()
  return done ? { ok: true } : { ok: false, reason: 'unsupported' }
}
