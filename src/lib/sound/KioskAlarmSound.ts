import type { CriticalAlertKind } from '../criticalAlerts'
import { createFullyKioskBridge } from '../fullyKiosk'

const ALARM_STREAM = 4
const TTS_STREAM = 9
const NATIVE_REPEAT_MS = 6_000

interface KioskAlarmLocation {
  protocol: string
  hostname: string
  origin: string
}

const ANNOUNCEMENTS: Partial<Record<CriticalAlertKind, string>> = {
  smoke: 'Attenzione. Test allarme fumo attivo.',
  gas: 'Attenzione. Allarme gas attivo.',
  water: 'Attenzione. Allarme allagamento attivo.',
  heat: 'Attenzione. Allarme temperatura attivo.',
  siren: 'Attenzione. Sirena di emergenza attiva.',
  intrusion: 'Attenzione. Allarme intrusione attivo.',
  safety: 'Attenzione. Allarme di sicurezza attivo.',
}

/**
 * Uses Fully Kiosk's Android alarm stream, bypassing WebView autoplay rules.
 * Web Audio still runs in parallel as the normal-browser and harmonic layer.
 */
export function startKioskAlarmSound(
  fully: FullyKioskJavascriptInterface | undefined,
  location: KioskAlarmLocation,
  kind: CriticalAlertKind,
): () => void {
  const bridge = createFullyKioskBridge(fully, location)
  if (!bridge) return () => {}

  const previousAlarmVolume = bridge.getAudioVolume(ALARM_STREAM)
  const previousTtsVolume = bridge.getAudioVolume(TTS_STREAM)
  bridge.setAudioVolume(100, ALARM_STREAM)
  const url = `${location.origin}/alarm-siren.wav`
  const nativeSiren = bridge.playSound(url, true, ALARM_STREAM)
  let announcementTimer: ReturnType<typeof setInterval> | null = null

  if (!nativeSiren) {
    const announcement = ANNOUNCEMENTS[kind] ?? ANNOUNCEMENTS.safety
    bridge.setAudioVolume(100, TTS_STREAM)
    const announce = () => { if (announcement) bridge.say(announcement) }
    announce()
    announcementTimer = setInterval(announce, NATIVE_REPEAT_MS)
  }

  return () => {
    if (announcementTimer) clearInterval(announcementTimer)
    bridge.stopSound()
    bridge.stopSpeech()
    if (previousAlarmVolume !== null) bridge.setAudioVolume(previousAlarmVolume, ALARM_STREAM)
    if (previousTtsVolume !== null) bridge.setAudioVolume(previousTtsVolume, TTS_STREAM)
  }
}
