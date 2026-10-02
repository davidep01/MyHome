import { MANUAL_BRIGHTNESS_MS, MANUAL_SCREEN_OFF_MS, wakeKiosk } from './kioskWakePolicy'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { kioskApi } from '../api/backend'
import { createFullyKioskBridge } from './fullyKiosk'
import { testKioskAlarmChannel } from './sound/KioskAlarmChannel'
import { uid } from './uid'

const DEVICE_ID_KEY = 'myhome.kioskDeviceId'
let fallbackDeviceId: string | null = null
const REBOOT_KEY = 'myhome.kioskPendingReboot'
const bootId = uid('boot')

/** Identità stabile del tablet: l'ID Fully quando c'è, altrimenti un uid persistito. */
export function getKioskDeviceId(): string {
  const bridge = createFullyKioskBridge(window.fully, window.location)
  const fullyId = bridge?.getDeviceId()
  if (fullyId && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(fullyId)) return fullyId
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY)
    if (stored && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(stored)) return stored
  } catch { /* use a stable session ID */ }
  fallbackDeviceId ??= uid('kiosk')
  try { localStorage.setItem(DEVICE_ID_KEY, fallbackDeviceId) } catch { /* optional */ }
  return fallbackDeviceId
}

export type KioskCommandName = 'reload' | 'screenOn' | 'screenOff' | 'brightness' | 'say' | 'screensaverStart' | 'screensaverStop' | 'audioTest' | 'restart'

export type KioskCommandOutcome =
  | { ok: true }
  /** Fully non è raggiungibile: interfaccia JavaScript spenta o origine non fidata. */
  | { ok: false; reason: 'no-bridge' }
  /** Fully c'è ma questa versione non espone la funzione. */
  | { ok: false; reason: 'unsupported' | 'audio-blocked' }

/**
 * Esegue un comando dalla regia (§4.5/§12) sul tablet corrente via Fully.
 *
 * `reload` e `audioTest` vivono nel browser e funzionano sempre: è il motivo
 * per cui erano gli unici a "funzionare" quando Fully non è disponibile,
 * mentre tutti gli altri fallivano in silenzio. Ora l'esito torna al
 * chiamante, che lo riferisce alla regia.
 */
export async function executeKioskCommand(
  command: KioskCommandName,
  value?: number | string,
): Promise<KioskCommandOutcome> {
  if (command === 'reload') {
    window.location.reload()
    return { ok: true }
  }
  if (command === 'audioTest') {
    return await testKioskAlarmChannel() ? { ok: true } : { ok: false, reason: 'audio-blocked' }
  }
  const bridge = createFullyKioskBridge(window.fully, window.location)
  if (!bridge) return { ok: false, reason: 'no-bridge' }
  const done = (() => {
    switch (command) {
      case 'screenOn': {
        const applied = bridge.turnScreenOn()
        if (applied) wakeKiosk('native')
        return applied
      }
      case 'screenOff': {
        if (useFullyKioskStore.getState().emergencyActive) return false
        const applied = bridge.turnScreenOff()
        if (applied) useFullyKioskStore.getState()._patch({ screenOn: false, manualScreenOffUntil: Date.now() + MANUAL_SCREEN_OFF_MS })
        return applied
      }
      case 'brightness': {
        if (typeof value !== 'number' || !Number.isFinite(value) || useFullyKioskStore.getState().emergencyActive) return false
        const applied = bridge.setBrightness(value)
        if (applied) useFullyKioskStore.getState()._patch({ manualBrightness: value, screenBrightness: value, manualBrightnessUntil: Date.now() + MANUAL_BRIGHTNESS_MS })
        return applied
      }
      case 'say': return typeof value === 'string' ? bridge.say(value) : false
      case 'screensaverStart': return bridge.startScreensaver()
      case 'screensaverStop': return bridge.stopScreensaver()
      case 'restart': return bridge.restartApp()
      default: return false
    }
  })()
  return done ? { ok: true } : { ok: false, reason: 'unsupported' }
}


export function rememberKioskRestart(commandId: string, command: string): void {
  try { localStorage.setItem(REBOOT_KEY, JSON.stringify({ commandId, command, bootId, at: Date.now() })) } catch { /* acceptance remains unconfirmed */ }
}

export async function confirmKioskRestart(): Promise<void> {
  let raw: string | null
  try { raw = localStorage.getItem(REBOOT_KEY) } catch { return }
  if (!raw) return
  let pending: { commandId?: string; command?: string; bootId?: string; at?: number }
  try { pending = JSON.parse(raw) } catch { forgetKioskRestart(); return }
  if (!pending || typeof pending !== 'object') { forgetKioskRestart(); return }
  try {
    if (typeof pending.commandId !== 'string' || !['reload', 'restart'].includes(pending.command ?? '') || typeof pending.at !== 'number' || Date.now() - pending.at > 90_000 || pending.at > Date.now()) {
      localStorage.removeItem(REBOOT_KEY)
      return
    }
    if (pending.bootId === bootId || !pending.bootId) return
    await kioskApi.ack({ deviceId: getKioskDeviceId(), commandId: pending.commandId, command: pending.command!, ok: true, status: 'completed' })
    localStorage.removeItem(REBOOT_KEY)
  } catch { /* retry on the next heartbeat */ }
}

export function forgetKioskRestart(): void {
  try { localStorage.removeItem(REBOOT_KEY) } catch { /* optional storage */ }
}
