import { useEffect, useRef, useState } from 'react'

/**
 * Returns `active = element is in the viewport AND the page is visible`.
 *
 * Used to gate expensive live work (camera WebRTC/HLS/MJPEG streams) so it only
 * runs for cameras actually on screen with the display on. Off-screen cards and
 * a powered-off wall tablet tear their streams down — otherwise several streams
 * stay live 24/7 and exhaust the tablet's memory/sockets. A small rootMargin
 * pre-warms a card just before it scrolls into view.
 */
export function useActiveWhenVisible<T extends Element>(rootMargin = '150px') {
  const ref = useRef<T>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let inView = false
    let pageVisible = document.visibilityState === 'visible'
    const update = () => setActive(inView && pageVisible)

    const io = new IntersectionObserver(
      (entries) => { inView = entries[0]?.isIntersecting ?? false; update() },
      { rootMargin },
    )
    io.observe(el)

    const onVis = () => { pageVisible = document.visibilityState === 'visible'; update() }
    document.addEventListener('visibilitychange', onVis)

    return () => { io.disconnect(); document.removeEventListener('visibilitychange', onVis) }
  }, [rootMargin])

  return { ref, active }
}
