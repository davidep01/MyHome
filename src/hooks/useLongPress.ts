import { useRef, useCallback } from 'react'

export function useLongPress(
  onLongPress: () => void,
  onTap?: () => void,
  delay = 500,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const start = useCallback(() => {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, delay)
  }, [onLongPress, delay])

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!firedRef.current) onTap?.()
  }, [onTap])

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    firedRef.current = true
  }, [])

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd: stop,
  }
}
