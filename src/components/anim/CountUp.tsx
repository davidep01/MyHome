import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly counts toward `value` whenever it changes (and once on mount). Uses a
 * single short rAF pass per change — not a permanent loop — so it stays cheap on
 * an always-on kiosk. Snaps instantly under prefers-reduced-motion.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 800,
  className,
  suffix = '',
}: {
  value: number
  decimals?: number
  duration?: number
  className?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    const to = Number.isFinite(value) ? value : 0
    if (reduce || from === to) { setDisplay(to); fromRef.current = to; return }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return <span className={className}>{display.toFixed(decimals)}{suffix}</span>
}
