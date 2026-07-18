import type { CriticalAlertKind } from '../criticalAlerts'
import { createFullyKioskBridge } from '../fullyKiosk'

const ALARM_STREAM = 4
const MEDIA_STREAM = 3
const TTS_STREAM = 9
const NATIVE_REPEAT_MS = 6_000
const ALARM_ASSET_VERSION = '2'

interface KioskAlarmLocation {
  protocol: string
  hostname: string
  origin: string
}

const ANNOUNCEMENTS: Partial<Record<CriticalAlertKind, string>> = {
  smoke: 'Attenzione. Rilevato fumo. Allarme attivo.',
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
  const previousMediaVolume = bridge.getAudioVolume(MEDIA_STREAM)
  const previousTtsVolume = bridge.getAudioVolume(TTS_STREAM)
  // Fully.playSound usa lo stream Android 4; WebAudio usa invece lo stream 3.
  // Portarli entrambi al massimo rende l'emergenza udibile anche se uno dei due
  // percorsi è attenuato dalla configurazione del tablet.
  bridge.setAudioVolume(100, ALARM_STREAM)
  bridge.setAudioVolume(100, MEDIA_STREAM)
  const url = `${location.origin}/alarm-siren.wav?v=${ALARM_ASSET_VERSION}`
  const nativeSiren = bridge.playSound(url, true, ALARM_STREAM)
  let announcementTimer: ReturnType<typeof setInterval> | null = null
  let stopped = false

  const startAnnouncement = () => {
    if (stopped || announcementTimer) return
    const announcement = ANNOUNCEMENTS[kind] ?? ANNOUNCEMENTS.safety
    bridge.setAudioVolume(100, TTS_STREAM)
    const announce = () => { if (announcement) bridge.say(announcement) }
    announce()
    announcementTimer = setInterval(announce, NATIVE_REPEAT_MS)
  }

  if (!nativeSiren) {
    startAnnouncement()
  } else if (typeof fetch === 'function') {
    // La JS API di Fully restituisce void: una URL 404 sembra comunque un
    // comando riuscito. Verifichiamo quindi l'asset e passiamo al TTS nativo se
    // la sirena non è realmente raggiungibile dal kiosk.
    void fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then((response) => {
        if (!response.ok && !stopped) {
          bridge.stopSound()
          startAnnouncement()
        }
      })
      .catch(() => {
        if (!stopped) startAnnouncement()
      })
  }

  return () => {
    stopped = true
    if (announcementTimer) clearInterval(announcementTimer)
    bridge.stopSound()
    bridge.stopSpeech()
    if (previousAlarmVolume !== null) bridge.setAudioVolume(previousAlarmVolume, ALARM_STREAM)
    if (previousMediaVolume !== null) bridge.setAudioVolume(previousMediaVolume, MEDIA_STREAM)
    if (previousTtsVolume !== null) bridge.setAudioVolume(previousTtsVolume, TTS_STREAM)
  }
}
