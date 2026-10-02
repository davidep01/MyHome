import { useEffect, useRef, type RefObject } from 'react'
import { registerModal } from '../lib/modalStack'
export function useModalFocus(open: boolean, panel: RefObject<HTMLElement | null>, close: () => void, priority = 50, root = panel): void {
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close }, [close])
  useEffect(() => {
    if (!open || !panel.current || !root.current) return
    return registerModal(root.current, panel.current, () => closeRef.current(), priority)
  }, [open, panel, root, priority])
}
