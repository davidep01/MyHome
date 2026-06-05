import { useEffect, useState } from 'react'

/**
 * True only on a real desktop (wide viewport + a fine pointer/mouse). A wall
 * tablet in landscape can be ≥1024px wide but reports a coarse pointer, so it is
 * correctly treated as non-desktop — editing and Admin are desktop-only.
 */
export function useIsDesktop(minWidth = 1024): boolean {
  const query = `(min-width: ${minWidth}px) and (pointer: fine)`
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
