import { useEffect, useRef, useState } from 'react'
import { useEntityStore } from '../store/entities'
import { useDashboardConfig } from './useDashboardConfig'
import { doorbellConfig } from '../config/doorbell'

interface DoorbellState {
  ringing: boolean
  cameraEntityId: string
  ringAt: number | null
  dismiss: () => void
}

/**
 * Detects a rising edge on the doorbell entity (off/idle → active) and exposes a
 * `ringing` flag for the fullscreen alert. Entity + camera come from the admin
 * config (falling back to the static defaults).
 */
export function useDoorbell(): DoorbellState {
  const { data: config } = useDashboardConfig()
  const doorbellEntityId = config?.doorbell?.entityId || doorbellConfig.doorbellEntityId
  const cameraEntityId = config?.doorbell?.cameraEntityId || doorbellConfig.cameraEntityId

  const entity = useEntityStore((s) => s.entities[doorbellEntityId])
  const [ringing, setRinging] = useState(false)
  const [ringAt, setRingAt] = useState<number | null>(null)
  const prevState = useRef<string | undefined>(undefined)
  const dismissedFor = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const state = entity?.state
  // `event.*` entities (citofoni/Ring) expose the press as a changing timestamp
  // state, not a fixed "on" — so for them any state change is a ring. Other
  // domains (binary_sensor…) use the rising edge into an active state.
  const isEventEntity = doorbellEntityId.startsWith('event.')
  const isActive = state ? doorbellConfig.activeStates.includes(state) : false

  useEffect(() => {
    const prev = prevState.current
    prevState.current = state

    // Rising edge → ring (unless we already dismissed this episode).
    // We deliberately do NOT clear on the falling edge: a doorbell press is momentary,
    // so the fullscreen stays up for the full autoDismissMs window (or until dismissed).
    const triggered = isEventEntity
      ? prev !== undefined && state !== undefined && state !== prev
      : isActive && prev !== undefined && !doorbellConfig.activeStates.includes(prev)

    if (triggered) {
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
  }, [state, isActive, entity?.last_changed])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const dismiss = () => {
    dismissedFor.current = `${state}-${entity?.last_changed ?? ''}`
    if (timerRef.current) clearTimeout(timerRef.current)
    setRinging(false)
  }

  return { ringing, cameraEntityId, ringAt, dismiss }
}
