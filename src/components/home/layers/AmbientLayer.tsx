import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useClock } from '../../../hooks/useClock'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'
import { useThemeStore } from '../../../store/theme'
import { cn } from '../../../lib/utils'
import { WeatherIcon } from '../../weather/WeatherIcon'
import { screensaverApi, type KioskSettings } from '../../../api/backend'
import { KIOSK_ACTIVITY_EVENT, reportKioskScreensaver } from '../../../lib/kioskActivity'

const DEFAULT_IDLE_SECONDS = 180
const DEFAULT_SLIDE_SECONDS = 20
const DEFAULT_AMBIENT_BRIGHTNESS = 28

/** Sensore di prossimità (Generic Sensor API) — presente solo su alcuni WebView. */
interface ProximitySensorLike {
  near?: boolean
  addEventListener: (type: 'reading', listener: () => void) => void
  start: () => void
  stop: () => void
}

/**
 * Strato 4 — Ambient (DOMINICA M7): dopo 3 minuti di idle la dashboard si
 * dissolve in una superficie scura con orologio grande, data e meteo. Drift
 * lentissimo anti-burn-in (transform only). Si risveglia con: un tocco, il
 * sensore di presenza HA configurato, un balzo di luminosità dal sensore
 * luce del tablet (luce accesa / qualcuno passa), o la prossimità quando il
 * WebView la espone. Mai sopra un'anomalia danger.
 */
export function AmbientLayer({
  wakeEntityId,
  forceWake = false,
  settings,
}: {
  /** binary_sensor di presenza: 'on' → la dashboard si risveglia da sola. */
  wakeEntityId?: string
  /** true (es. allarme in corso) → l'ambient non copre mai la home. */
  forceWake?: boolean
  settings?: KioskSettings['screensaver']
}) {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeRef = useRef<() => void>(() => {})
  const enabled = settings?.enabled !== false
  const idleMs = (settings?.idleSeconds ?? DEFAULT_IDLE_SECONDS) * 1_000
  const brightness = settings?.brightness ?? DEFAULT_AMBIENT_BRIGHTNESS

  useEffect(() => {
    const markActive = () => {
      setIdle(false)
      if (timer.current) clearTimeout(timer.current)
      if (enabled) timer.current = setTimeout(() => setIdle(true), idleMs)
    }
    wakeRef.current = markActive
    if (enabled) timer.current = setTimeout(() => setIdle(true), idleMs)
    window.addEventListener('pointerdown', markActive)
    window.addEventListener('keydown', markActive)
    window.addEventListener(KIOSK_ACTIVITY_EVENT, markActive)
    const onVisibility = () => { if (document.visibilityState === 'visible') markActive() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('pointerdown', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener(KIOSK_ACTIVITY_EVENT, markActive)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, idleMs])

  useEffect(() => {
    if (forceWake) wakeRef.current()
  }, [forceWake])

  // Presence wake: il fronte di salita del sensore equivale a un tocco.
  useEffect(() => {
    if (!wakeEntityId) return
    return useEntityStore.subscribe((state, prev) => {
      const now = state.entities[wakeEntityId]?.state
      const before = prev.entities[wakeEntityId]?.state
      if (now === 'on' && before !== 'on') wakeRef.current()
    })
  }, [wakeEntityId])

  // Sensore luce del tablet: un BALZO di lux (luce accesa, ombra che passa)
  // sveglia la dashboard. La deriva lenta (alba) resta sotto soglia.
  useEffect(() => {
    let prev: number | null = null
    return useThemeStore.subscribe((s) => {
      const lux = s.lastLux
      if (lux == null) return
      if (prev != null) {
        const jump = lux - prev
        if (jump > 12 || (prev >= 1 && lux / prev >= 2.5 && jump > 4)) wakeRef.current()
      }
      prev = lux
    })
  }, [])

  // Prossimità (se il WebView la espone): qualcuno vicino allo schermo → sveglia.
  useEffect(() => {
    const Ctor = (window as { ProximitySensor?: new (opts?: { frequency?: number }) => ProximitySensorLike }).ProximitySensor
    if (typeof Ctor !== 'function') return
    let sensor: ProximitySensorLike | null = null
    try {
      sensor = new Ctor({ frequency: 2 })
      sensor.addEventListener('reading', () => { if (sensor?.near) wakeRef.current() })
      sensor.start()
    } catch {
      return // permesso negato o sensore assente: si vive bene lo stesso
    }
    return () => { try { sensor?.stop() } catch { /* noop */ } }
  }, [])

  const show = enabled && idle && !forceWake

  useEffect(() => {
    document.documentElement.classList.toggle('kiosk-idle', show)
    reportKioskScreensaver(show, brightness)
    return () => {
      document.documentElement.classList.remove('kiosk-idle')
      if (show) reportKioskScreensaver(false, brightness)
    }
  }, [show, brightness])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          style={{ background: '#070709' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        >
          <AmbientContent slideSeconds={settings?.slideSeconds ?? DEFAULT_SLIDE_SECONDS} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const PHOTO_MOVES: { scale: number[]; x: string[]; y: string[] }[] = [
  { scale: [1.01, 1.08], x: ['-1.2%', '1.2%'], y: ['-0.6%', '0.6%'] },
  { scale: [1.08, 1.01], x: ['1%', '-1%'], y: ['0.8%', '-0.8%'] },
  { scale: [1.02, 1.09], x: ['0%', '-1.2%'], y: ['1%', '-0.5%'] },
]

function AmbientContent({ slideSeconds }: { slideSeconds: number }) {
  const { time, date } = useClock()
  const { data: weather } = useCurrentWeather()
  const lastLux = useThemeStore((s) => s.lastLux)
  const reduceMotion = useReducedMotion()
  const [photoIndex, setPhotoIndex] = useState(0)
  const { data } = useQuery({
    queryKey: ['screensaver-photos'],
    queryFn: screensaverApi.list,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const photos = useMemo(() => data?.photos ?? [], [data?.photos])

  useEffect(() => {
    if (photos.length < 2) return
    const timer = setInterval(() => setPhotoIndex((index) => (index + 1) % photos.length), slideSeconds * 1_000)
    return () => clearInterval(timer)
  }, [photos.length, slideSeconds])

  // Precarica le prossime due foto (§14): la dissolvenza non deve mai
  // aspettare la rete, e l'album remoto scalda la cache del backend.
  useEffect(() => {
    if (photos.length < 2) return
    for (const offset of [1, 2]) {
      const next = photos[(photoIndex + offset) % photos.length]
      if (next) new Image().src = next.url
    }
  }, [photoIndex, photos])

  // Buio pesto (notte fonda): l'orologio si spegne un altro po'.
  const dim = lastLux != null && lastLux < 5
  const visibleIndex = photos.length ? photoIndex % photos.length : 0
  const photo = photos[visibleIndex]
  const movement = PHOTO_MOVES[visibleIndex % PHOTO_MOVES.length]

  return (
    <>
      <AnimatePresence initial={false}>
        {photo && (
          <motion.img
            key={photo.url}
            src={photo.url}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            className="absolute inset-[-4%] h-[108%] w-[108%] object-cover"
            initial={{ opacity: 0, scale: reduceMotion ? 1.03 : movement.scale[0] }}
            animate={{
              opacity: 1,
              scale: reduceMotion ? 1.03 : movement.scale,
              x: reduceMotion ? 0 : movement.x,
              y: reduceMotion ? 0 : movement.y,
            }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: reduceMotion ? 0.15 : Math.min(2.8, slideSeconds / 4) },
              scale: { duration: slideSeconds + 1, ease: 'linear' },
              x: { duration: slideSeconds + 1, ease: 'linear' },
              y: { duration: slideSeconds + 1, ease: 'linear' },
            }}
          />
        )}
      </AnimatePresence>
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0',
          photo ? 'bg-[linear-gradient(180deg,rgba(0,0,0,.22),rgba(0,0,0,.48))]' : 'bg-[#070709]',
        )}
      />
      <div
        className="ambient-drift relative z-10 flex max-w-[92vw] flex-col items-center gap-3 text-center drop-shadow-[0_2px_18px_rgba(0,0,0,.45)]"
        role="status"
        aria-label={`Sono le ${time}, ${date}`}
      >
        <span className={cn('text-[clamp(72px,16vw,148px)] font-light leading-none tracking-[-0.035em] tabular-nums transition-colors duration-1000', dim ? 'text-white/65' : 'text-white/95')}>{time}</span>
        <span className="text-[clamp(16px,2.2vw,24px)] capitalize text-white/70">{date}</span>
        {weather && (
          <span className="mt-2 flex items-center gap-2 text-[clamp(15px,2vw,21px)] text-white/75">
            <WeatherIcon code={weather.icon} size={27} className="opacity-90" />
            {weather.temp}° · {weather.description}
          </span>
        )}
      </div>
      {photos.length > 1 && (
        <span aria-hidden="true" className="absolute bottom-[max(18px,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-white/45">
          {visibleIndex + 1} / {photos.length}
        </span>
      )}
    </>
  )
}
