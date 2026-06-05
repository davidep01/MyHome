import { useEffect } from 'react'

/**
 * Drives the `perf-lite` class on <html>, which drops the (expensive) glass
 * backdrop-filters for a solid frosted surface. Three inputs, in priority:
 *
 *   1. Manual override   — localStorage `myhome.perfMode` = 'on' | 'off'
 *   2. Device heuristic  — low deviceMemory / CPU → start lite immediately
 *   3. Runtime watchdog  — measures real frame timing for a window after mount
 *                          and degrades to lite if sustained jank is detected
 *                          (catches weak GPUs that specs don't reveal).
 *
 * Once degraded it stays degraded for the session (no oscillation).
 */
const KEY = 'myhome.perfMode'

function lowEndDevice(): boolean {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory
  const cpu = navigator.hardwareConcurrency
  if (typeof mem === 'number' && mem <= 3) return true
  if (typeof cpu === 'number' && cpu <= 4) return true
  return false
}

export function usePerfMode() {
  useEffect(() => {
    const root = document.documentElement
    const override = localStorage.getItem(KEY)

    const setLite = (on: boolean) => root.classList.toggle('perf-lite', on)

    if (override === 'on') { setLite(true); return }
    if (override === 'off') { setLite(false); return }

    // Auto mode
    if (lowEndDevice()) { setLite(true); return }

    // Runtime FPS watchdog: sample frame deltas; if >40% of frames in a
    // rolling window are slow (<~42fps), switch to lite once and stop.
    let raf = 0
    let last = performance.now()
    let frames = 0
    let slow = 0
    const WINDOW = 150          // ~2.5s of frames
    const SLOW_MS = 24          // frame slower than ~42fps
    const MAX_FRAMES = 900      // give up probing after ~15s if fine

    let total = 0
    const tick = (now: number) => {
      const delta = now - last
      last = now
      total++
      frames++
      if (delta > SLOW_MS) slow++

      if (frames >= WINDOW) {
        if (slow / frames > 0.4) { setLite(true); return } // degrade & stop
        frames = 0; slow = 0
      }
      if (total < MAX_FRAMES) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}
