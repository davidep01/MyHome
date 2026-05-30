/* eslint-disable react-hooks/set-state-in-effect --
   This hook is an edge detector: it must compare the entity state across renders
   inside an effect and set `ringing` when a rising edge occurs. That is the
   intended pattern here, not a cascading-render bug. */
import { useEffect, useRef, useState } from 'react'
import { useEntityStore } from '../store/entities'
import { doorbellConfig } from '../config/doorbell'

interface DoorbellState {
  ringing: boolean
  cameraEntityId: string
  ringAt: number | null
  dismiss: () => void
}

/**
 * Detects a rising edge on the doorbell entity (off/idle → active) and exposes a
 * `ringing` flag for the fullscreen alert. Auto-clears when the sensor goes idle.
 */
export function useDoorbell(): DoorbellState {
  const entity = useEntityStore((s) => s.entities[doorbellConfig.doorbellEntityId])
  const [ringing, setRinging] = useState(false)
  const [ringAt, setRingAt] = useState<number | null>(null)
  const prevState = useRef<string | undefined>(undefined)
  const dismissedFor = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const state = entity?.state
  const isActive = state ? doorbellConfig.activeStates.includes(state) : false

  useEffect(() => {
    const prev = prevState.current
    prevState.current = state

    // Rising edge into an active state → ring (unless we already dismissed this episode)
    if (isActive && prev !== undefined && !doorbellConfig.activeStates.includes(prev)) {
      const key = `${state}-${entity?.last_changed ?? Date.now()}`
      if (dismissedFor.current !== key) {
        setRinging(true)
        setRingAt(Date.now())
        if (doorbellConfig.autoDismissMs > 0) {
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => setRinging(false), doorbellConfig.autoDismissMs)
        }
      }
    }

    // Sensor returned idle → clear
    if (!isActive && ringing) setRinging(false)
  }, [state, isActive, ringing, entity?.last_changed])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const dismiss = () => {
    dismissedFor.current = `${state}-${entity?.last_changed ?? ''}`
    if (timerRef.current) clearTimeout(timerRef.current)
    setRinging(false)
  }

  return { ringing, cameraEntityId: doorbellConfig.cameraEntityId, ringAt, dismiss }
}
