import { useFullyKioskStore } from '../store/fullyKiosk'
import { createFullyKioskBridge } from './fullyKiosk'
import { markKioskActivity } from './kioskActivity'

export const MANUAL_SCREEN_OFF_MS = 30_000
export const MANUAL_BRIGHTNESS_MS = 10 * 60_000
export type WakeReason = 'touch' | 'remote' | 'native' | 'motion' | 'presence' | 'light' | 'proximity' | 'doorbell' | 'emergency'
export function wakeAllowed(reason: WakeReason, offUntil: number, emergency: boolean, now = Date.now()): boolean {
  return emergency || ['touch', 'remote', 'native', 'doorbell', 'emergency'].includes(reason) || now >= offUntil
}
/** One wake policy shared by the native bridge, HA presence and browser sensors. */
export function wakeKiosk(reason: WakeReason): boolean {
  const state = useFullyKioskStore.getState()
  if (!wakeAllowed(reason, state.manualScreenOffUntil, state.emergencyActive)) return false
  if (['touch', 'remote', 'native'].includes(reason)) state._patch({ manualScreenOffUntil: 0 })
  if (reason !== 'native') {
    const bridge = createFullyKioskBridge(window.fully, window.location)
    if (bridge?.turnScreenOn()) state._patch({ screenOn: true })
  } else state._patch({ screenOn: true })
  markKioskActivity()
  return true
}
