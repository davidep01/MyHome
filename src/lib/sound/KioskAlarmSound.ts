import type { CriticalAlertKind } from '../criticalAlerts'
import { createFullyKioskBridge } from '../fullyKiosk'

const ALARM_STREAM = 4
const MEDIA_STREAM = 3
const TTS_STREAM = 9
const NATIVE_REPEAT_MS = 6_000
const NATIVE_VERIFY_MS = 1_500
const WEBVIEW_RETRY_MS = 2_000
const ALARM_ASSET_VERSION = '3'

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
 * Last-resort path for a Fully WebView where the privileged JS interface is
 * present but blocked by the origin guard. Fully can autoplay an HTML5 audio
 * element when its Autoplay setting is enabled; otherwise every interaction
 * retries playback so the alert cannot remain silently stuck.
 */
function startWebViewAlarmSound(fully: FullyKioskJavascriptInterface | undefined, url: string): () => void {
  if (!fully || typeof Audio !== 'function') return () => {}
  const audio = new Audio(url)
  audio.loop = true
  audio.preload = 'auto'
  audio.volume = 1
  let stopped = false
  const attempt = () => {
    if (stopped || !audio.paused) return
    void audio.play().catch(() => undefined)
  }
  attempt()
  const retryTimer = setInterval(attempt, WEBVIEW_RETRY_MS)
  window.addEventListener('pointerdown', attempt)
  window.addEventListener('keydown', attempt)
  return () => {
    stopped = true
    clearInterval(retryTimer)
    window.removeEventListener('pointerdown', attempt)
    window.removeEventListener('keydown', attempt)
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
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
  const url = `${location.origin}/alarm-siren.wav?v=${ALARM_ASSET_VERSION}`
  const bridge = createFullyKioskBridge(fully, location)
  if (!bridge) return startWebViewAlarmSound(fully, url)

  const previousAlarmVolume = bridge.getAudioVolume(ALARM_STREAM)
  const previousMediaVolume = bridge.getAudioVolume(MEDIA_STREAM)
  const previousTtsVolume = bridge.getAudioVolume(TTS_STREAM)
  // Stream 4 (Alarm) può richiedere il permesso Android per ignorare DND.
  // Il player nativo usa quindi stream 3 (Media), fuori dalle regole autoplay
  // della WebView; stream 4 resta al massimo per eventuali layer del sistema.
  bridge.turnScreenOn()
  bridge.setAudioVolume(100, ALARM_STREAM)
  bridge.setAudioVolume(100, MEDIA_STREAM)
  bridge.setAudioVolume(100, TTS_STREAM)
  bridge.stopSound()
  const nativeSiren = bridge.playSound(url, true, MEDIA_STREAM)
  let announcementTimer: ReturnType<typeof setInterval> | null = null
  let verificationTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const startAnnouncement = () => {
    if (stopped || announcementTimer) return
    const announcement = ANNOUNCEMENTS[kind] ?? ANNOUNCEMENTS.safety
    const announce = () => { if (announcement) bridge.say(announcement) }
    announce()
    announcementTimer = setInterval(announce, NATIVE_REPEAT_MS)
  }

  if (!nativeSiren) {
    startAnnouncement()
  } else {
    // `playSound` restituisce void: la sola assenza di eccezioni non prova che
    // Android abbia ottenuto l'audio focus. Verifica e secondo tentativo dopo
    // il wake; le versioni Fully senza isMusicActive ricevono anche il TTS.
    verificationTimer = setTimeout(() => {
      if (stopped || bridge.isMusicActive() === true) return
      bridge.playSound(url, true, MEDIA_STREAM)
      startAnnouncement()
    }, NATIVE_VERIFY_MS)
  }

  if (nativeSiren && typeof fetch === 'function') {
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
    if (verificationTimer) clearTimeout(verificationTimer)
    if (announcementTimer) clearInterval(announcementTimer)
    bridge.stopSound()
    bridge.stopSpeech()
    if (previousAlarmVolume !== null) bridge.setAudioVolume(previousAlarmVolume, ALARM_STREAM)
    if (previousMediaVolume !== null) bridge.setAudioVolume(previousMediaVolume, MEDIA_STREAM)
    if (previousTtsVolume !== null) bridge.setAudioVolume(previousTtsVolume, TTS_STREAM)
  }
}
