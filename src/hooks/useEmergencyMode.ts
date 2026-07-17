import { useEffect, useRef } from 'react'
import type { CriticalAlert } from '../lib/criticalAlerts'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { createFullyKioskBridge } from '../lib/fullyKiosk'
import { alarmApi } from '../api/backend'
import { drainQueue, enqueuePhoto } from '../lib/alarmPhoto'
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
  const alertId = criticalAlertEventKey(alerts[0])
  useEffect(() => {
    if (!alertId) {
      shotFor.current = null
      return
    }
    if (!photoEnabled || shotFor.current === alertId) return
    shotFor.current = alertId
    const bridge = createFullyKioskBridge(window.fully, window.location)
    const image = bridge?.getCamshotDataUrl() ?? null
    if (!image) return
    const photo = {
      image,
      alertId,
      takenAt: new Date().toISOString(),
      deviceId: bridge?.getDeviceId() ?? undefined,
    }
    void alarmApi.uploadPhoto(photo).catch(() => enqueuePhoto(localStorage, photo))
  }, [photoEnabled, alertId])

  // Le foto rimaste in coda (rete giù durante l'allarme) partono al ritorno online.
  useEffect(() => {
    if (!photoEnabled) return
    const flush = () => {
      for (const photo of drainQueue(localStorage)) {
        void alarmApi.uploadPhoto(photo).catch(() => enqueuePhoto(localStorage, photo))
      }
    }
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [photoEnabled])
}
