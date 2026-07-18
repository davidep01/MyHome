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

/**
 * Esegue un comando dalla regia (§4.5/§12) sul tablet corrente via Fully.
 * `reload` funziona anche senza Fully (browser normale).
 */
export function executeKioskCommand(command: KioskCommandName, value?: number | string): void {
  if (command === 'reload') {
    window.location.reload()
    return
  }
  if (command === 'audioTest') {
    testKioskAlarmChannel()
    return
  }
  const bridge = createFullyKioskBridge(window.fully, window.location)
  if (!bridge) return
  switch (command) {
    case 'screenOn': bridge.turnScreenOn(); break
    case 'screenOff': bridge.turnScreenOff(); break
    case 'brightness': if (typeof value === 'number') bridge.setBrightness(value); break
    case 'say': if (typeof value === 'string') bridge.say(value); break
    case 'screensaverStart': bridge.startScreensaver(); break
    case 'screensaverStop': bridge.stopScreensaver(); break
    case 'restart': bridge.restartApp(); break
  }
}
