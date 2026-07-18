import { useEffect } from 'react'
import { kioskApi } from '../api/backend'
import { createFullyKioskBridge } from '../lib/fullyKiosk'
import { getKioskDeviceId } from '../lib/kioskDevice'
import { useFullyKioskStore } from '../store/fullyKiosk'
import { useKioskAudioStore } from '../store/kioskAudio'

const HEARTBEAT_MS = 60_000

/**
 * Heartbeat della flotta (§4.5): ogni minuto il tablet dice alla regia chi è e
 * come sta (batteria, alimentazione, schermo, luminosità, pagina, memoria).
 * Best-effort: se il backend non risponde si riprova al giro dopo.
 */
export function useKioskHeartbeat(): void {
  useEffect(() => {
    const send = () => {
      const bridge = createFullyKioskBridge(window.fully, window.location)
      const fully = useFullyKioskStore.getState()
      const audio = useKioskAudioStore.getState()
      const memory = (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
      void kioskApi.heartbeat({
        deviceId: getKioskDeviceId(),
        battery: bridge?.getBatteryLevel() ?? undefined,
        charging: bridge?.isPlugged() ?? undefined,
        screenOn: bridge?.getScreenOn() ?? undefined,
        brightness: bridge?.getBrightness() ?? undefined,
        screensaver: useFullyKioskStore.getState().screensaverActive,
        page: window.location.pathname,
        memoryMb: typeof memory === 'number' ? Math.round(memory / 1_048_576) : undefined,
        fully: fully.availability,
        nativeAudio: fully.capabilities.soundPlayback,
        audioChannel: audio.status,
        audioPlaying: audio.playing,
      }).catch(() => undefined)
    }
    send()
    const timer = window.setInterval(send, HEARTBEAT_MS)
    const removeAudioListener = useKioskAudioStore.subscribe((state, previous) => {
      if (state.status !== previous.status || state.playing !== previous.playing) send()
    })
    const removeFullyListener = useFullyKioskStore.subscribe((state, previous) => {
      if (state.availability !== previous.availability || state.capabilities.soundPlayback !== previous.capabilities.soundPlayback) send()
    })
    return () => {
      window.clearInterval(timer)
      removeAudioListener()
      removeFullyListener()
    }
  }, [])
}
