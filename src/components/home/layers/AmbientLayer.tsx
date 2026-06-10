import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useClock } from '../../../hooks/useClock'
import { useCurrentWeather } from '../../../hooks/useWeather'
import { useEntityStore } from '../../../store/entities'

const IDLE_MS = 180_000

/**
 * Strato 4 — Ambient (DOMINICA M7): dopo 3 minuti di idle la dashboard si
 * dissolve in una superficie scura con orologio grande, data e meteo. Drift
 * lentissimo anti-burn-in (transform only). Esce con un tocco, col movimento
 * del sensore di presenza configurato, o se compare un'anomalia danger.
 */
export function AmbientLayer({
  wakeEntityId,
  forceWake = false,
}: {
  /** binary_sensor di presenza: 'on' → la dashboard si risveglia da sola. */
  wakeEntityId?: string
  /** true (es. allarme in corso) → l'ambient non copre mai la home. */
  forceWake?: boolean
}) {
  const [idle, setIdle] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const markActive = () => {
      setIdle(false)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setIdle(true), IDLE_MS)
    }
    wakeRef.current = markActive
    // arming iniziale: solo scheduling, nessun setState sincrono nell'effect
    timer.current = setTimeout(() => setIdle(true), IDLE_MS)
    window.addEventListener('pointerdown', markActive)
    window.addEventListener('keydown', markActive)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      window.removeEventListener('pointerdown', markActive)
      window.removeEventListener('keydown', markActive)
    }
  }, [])

  // Presence wake: il fronte di salita del sensore equivale a un tocco.
  useEffect(() => {
    if (!wakeEntityId) return
    return useEntityStore.subscribe((state, prev) => {
      const now = state.entities[wakeEntityId]?.state
      const before = prev.entities[wakeEntityId]?.state
      if (now === 'on' && before !== 'on') wakeRef.current()
    })
  }, [wakeEntityId])

  const show = idle && !forceWake

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
          <AmbientContent />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AmbientContent() {
  const { time, date } = useClock()
  const { data: weather } = useCurrentWeather()

  return (
    <div className="ambient-drift flex flex-col items-center gap-3 text-center">
      <span className="text-[112px] font-light leading-none tracking-[-0.02em] text-white/90 tabular-nums">{time}</span>
      <span className="text-lg capitalize text-white/40">{date}</span>
      {weather && (
        <span className="mt-2 flex items-center gap-2 text-base text-white/45">
          <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="" className="h-8 w-8 opacity-80" />
          {weather.temp}° · {weather.description}
        </span>
      )}
    </div>
  )
}
