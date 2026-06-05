import { useEffect } from 'react'

/**
 * Keeps the screen awake on wall-mounted tablets via the Screen Wake Lock API.
 * The lock is automatically released by the browser when the tab is hidden, so
 * we re-acquire it whenever the page becomes visible again. No-op (and silent)
 * on browsers/contexts without the API or where it's blocked.
 */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const wl = (navigator as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }).wakeLock
    if (!wl) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        sentinel = await wl.request('screen')
        sentinel.addEventListener('release', () => { sentinel = null })
      } catch {
        /* denied (e.g. low battery) or not allowed — silently ignore */
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
