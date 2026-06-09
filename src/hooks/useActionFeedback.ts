import { useEffect, useRef, useState } from 'react'
import { useHaptic } from './useHaptic'

/**
 * Feedback fisico per le azioni ottimistiche: shake (+ haptic pesante) quando
 * HA rifiuta il comando e lo stato fa rollback. Il successo non ha fanfara:
 * è già comunicato dal cambio di stato della card (tint/glow).
 */
export function useActionFeedback() {
  const [feedbackClass, setFeedbackClass] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { heavy } = useHaptic()

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const actionFailed = () => {
    heavy()
    // azzera e riapplica al frame successivo così lo shake riparte anche
    // su fallimenti ravvicinati
    setFeedbackClass('')
    requestAnimationFrame(() => setFeedbackClass('widget-anim-errorShake'))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedbackClass(''), 650)
  }

  return { feedbackClass, actionFailed }
}
