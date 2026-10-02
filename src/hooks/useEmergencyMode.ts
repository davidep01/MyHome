import { useEffect, useRef } from 'react'
import type { CriticalAlert } from '../lib/criticalAlerts'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { createFullyKioskBridge } from '../lib/fullyKiosk'
import { alarmApi } from '../api/backend'
import { flushPhotoQueue, enqueuePhoto } from '../lib/alarmPhoto'
import { criticalAlertEventKey } from '../lib/criticalAlerts'

/**
 * Modalità allarme del kiosk (§11): con un'emergenza attiva lo schermo si
 * accende alla massima luminosità (arbitrato da useFullyKiosk) e — se l'admin
 * ha attivato l'opt-in — la fotocamera del tablet scatta UNA foto per evento,
 * caricata sul backend o accodata in locale finché la rete non torna.
 * Niente video, niente scatti continui: una fotografia, con data e dispositivo.
 */
export function useEmergencyMode(alerts: CriticalAlert[], photoEnabled: boolean): void {
  const active = alerts.length > 0

  useEffect(() => {
    useFullyKioskStore.getState()._patch({ emergencyActive: active })
    return () => {
      if (active) useFullyKioskStore.getState()._patch({ emergencyActive: false })
    }
  }, [active])

  // Una sola foto per ATTIVAZIONE: changedAt distingue due allarmi successivi
  // della stessa entità (l'id da solo resterebbe identico per sempre).
  const shotFor = useRef<string | null>(null)
  // Le simulazioni verificano UI, wake e audio, ma non devono mai acquisire
  // immagini né entrare nella coda persistente delle foto d'emergenza.
  const alertId = criticalAlertEventKey(alerts.find((alert) => !alert.test))
  useEffect(() => {
    if (!alertId) {
      shotFor.current = null
      return
    }
    if (!photoEnabled || shotFor.current === alertId) return
    let cancelled = false
    let attempts = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const capture = () => {
      if (cancelled) return
      attempts += 1
      const bridge = createFullyKioskBridge(window.fully, window.location)
      const image = bridge?.getCamshotDataUrl() ?? null
      if (!image) {
        if (attempts < 3) retry = setTimeout(capture, 2_000)
        return
      }
      shotFor.current = alertId
      const photo = { image, alertId, takenAt: new Date().toISOString(), deviceId: bridge?.getDeviceId() ?? undefined }
      let storage: Storage | null = null
      try { storage = window.localStorage } catch { /* immediate delivery */ }
      if (storage && enqueuePhoto(storage, photo)) {
        window.dispatchEvent(new Event('myhome:alarm-photo-pending'))
      } else {
        void alarmApi.uploadPhoto(photo).catch(() => { /* persistence unavailable */ })
      }
    }
    capture()
    return () => { cancelled = true; clearTimeout(retry) }
  }, [photoEnabled, alertId])

  // Le foto rimaste in coda (rete giù durante l'allarme) partono al ritorno online.
  useEffect(() => {
    if (!photoEnabled) return
    let cancelled = false
    let inFlight = false
    const flush = () => {
      if (cancelled || inFlight) return
      let storage: Storage
      try { storage = window.localStorage } catch { return }
      inFlight = true
      void flushPhotoQueue(storage, alarmApi.uploadPhoto, () => !cancelled)
        .catch(() => { /* retain the unacknowledged entry for retry */ })
        .finally(() => { inFlight = false })
    }
    flush()
    const retry = setInterval(flush, 30_000)
    window.addEventListener('online', flush)
    window.addEventListener('myhome:alarm-photo-pending', flush)
    return () => { cancelled = true; clearInterval(retry); window.removeEventListener('online', flush); window.removeEventListener('myhome:alarm-photo-pending', flush) }
  }, [photoEnabled])
}
