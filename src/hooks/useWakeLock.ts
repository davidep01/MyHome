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
    let acquiring = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const acquire = async () => {
      if (cancelled || acquiring || sentinel || document.visibilityState !== 'visible') return
      acquiring = true
      try {
        const acquired = await wl.request('screen')
        if (cancelled || document.visibilityState !== 'visible') { await acquired.release(); return }
        sentinel = acquired
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) sentinel = null
          if (!cancelled && document.visibilityState === 'visible') retry = setTimeout(() => { void acquire() }, 1_000)
        })
      } catch {
        /* denied (e.g. low battery) or not allowed — silently ignore */
      } finally { acquiring = false }
    }

    const onVisible = () => { if (document.visibilityState === 'visible' && !sentinel) acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
