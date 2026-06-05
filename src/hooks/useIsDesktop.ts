import { useEffect, useState } from 'react'

/**
 * True on a mouse-driven device (desktop/laptop). A touch wall tablet reports a
 * coarse pointer and is treated as non-desktop regardless of width, so editing
 * and Admin stay off there unless advanced mode is enabled. Pointer is a more
 * reliable signal than width (a small desktop window is still a desktop).
 */
export function useIsDesktop(): boolean {
  const query = '(pointer: fine)'
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return isDesktop
}
