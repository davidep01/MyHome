import { useEffect, useState } from 'react'

interface ClockState {
  time: string
  date: string
  /** Istante della minute tick, riusato da logiche dipendenti dalla fascia oraria. */
  now: Date
}

function getClockState(): ClockState {
  const now = new Date()
  return {
    time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
    now,
  }
}

export function useClock() {
  const [clock, setClock] = useState<ClockState>(() => getClockState())

  useEffect(() => {
    const id = setInterval(() => {
      setClock((current) => {
        const next = getClockState()
        return Math.floor(next.now.getTime() / 60_000) === Math.floor(current.now.getTime() / 60_000) ? current : next
      })
    }, 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') setClock(getClockState()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  return clock
}
