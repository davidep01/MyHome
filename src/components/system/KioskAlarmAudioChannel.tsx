import { useEffect, useRef } from 'react'
import { Volume2 } from 'lucide-react'
import { useKioskAudioStore } from '../../store/kioskAudio'
import {
  armKioskAlarmChannel,
  registerKioskAlarmChannel,
  setKioskAlarmChannelActive,
} from '../../lib/sound/KioskAlarmChannel'

const ALARM_AUDIO_URL = '/alarm-siren.wav?v=4'

/**
 * Static <audio>: Fully's “Autoplay Audio” explicitly applies only to static
 * elements. It stays mounted for the whole kiosk session and, once armed,
 * remains inaudibly active until an emergency raises the volume.
 */
export function KioskAlarmAudioChannel({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const status = useKioskAudioStore((state) => state.status)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const unregister = registerKioskAlarmChannel(audio)
    const retry = () => { if (document.visibilityState === 'visible') void armKioskAlarmChannel() }
    document.addEventListener('visibilitychange', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      unregister()
    }
  }, [])

  useEffect(() => setKioskAlarmChannelActive(active), [active])

  useEffect(() => {
    if (status === 'ready') return
    const retryTimer = window.setInterval(() => { void armKioskAlarmChannel() }, 2_000)
    return () => window.clearInterval(retryTimer)
  }, [status])

  return (
    <>
      <audio ref={audioRef} src={ALARM_AUDIO_URL} autoPlay loop muted preload="auto" className="hidden" aria-hidden="true" />
      {(status === 'needs-interaction' || status === 'error') && (
        <button
          type="button"
          onClick={() => { void armKioskAlarmChannel() }}
          className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] right-4 z-[130] flex min-h-[58px] max-w-[min(360px,calc(100%-32px))] items-center gap-3 rounded-[18px] bg-[#9f1028] px-4 text-left text-white shadow-2xl ring-1 ring-white/20 active:scale-[0.98]"
          aria-label="Attiva il canale audio degli allarmi"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15"><Volume2 size={21} aria-hidden="true" /></span>
          <span>
            <span className="block text-sm font-bold">Attiva audio allarmi</span>
            <span className="block text-xs text-white/75">Tocca una volta su questo tablet</span>
          </span>
        </button>
      )}
    </>
  )
}
