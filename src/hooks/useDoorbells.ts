/* eslint-disable react-hooks/set-state-in-effect --
   The active ring is driven by the live entity stream (rising-edge detection). */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntityStore } from '../store/entities'
import { useDashboardConfig } from './useDashboardConfig'
import { useSoundNotifications } from './useSoundNotifications'
import { useDoorbellEvents } from '../store/doorbellEvents'
import { normalizeDoorbells, DOORBELL_ACTIVE_STATES } from '../lib/doorbell'
import { uid } from '../lib/uid'
import type { DoorbellDevice } from '../api/backend'
import type { SoundPreset } from '../lib/sound/SoundManager'

const AUTO_DISMISS_MS = 30_000

interface ActiveRing {
  device: DoorbellDevice
  ringAt: number
}

/**
 * Watches every configured doorbell at once. On a rising edge it raises a single
 * active ring (which doorbell + its camera), logs the event and plays that
 * doorbell's sound. `event.*` entities ring on any state change (timestamp);
 * other domains ring on entering an active state.
 */
export function useDoorbells() {
  const { data: config } = useDashboardConfig()
  const entities = useEntityStore((s) => s.entities)
  const devices = useMemo(() => normalizeDoorbells(config), [config])
  const { play } = useSoundNotifications()
  const pushEvent = useDoorbellEvents((s) => s.push)

  const [active, setActive] = useState<ActiveRing | null>(null)
  const prevStates = useRef<Record<string, string | undefined>>({})
  const dismissedRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    for (const d of devices) {
      const e = entities[d.entityId]
      const state = e?.state
      const prev = prevStates.current[d.entityId]
      prevStates.current[d.entityId] = state
      if (prev === undefined || state === undefined) continue

      const isEvent = d.entityId.startsWith('event.')
      const triggered = isEvent
        ? state !== prev
        : DOORBELL_ACTIVE_STATES.includes(state) && !DOORBELL_ACTIVE_STATES.includes(prev)
      if (!triggered) continue

      const key = `${d.id}-${e?.last_changed ?? state}`
      if (dismissedRef.current === key) continue

      setActive({ device: d, ringAt: Date.now() })
      pushEvent({
        id: uid('ev'),
        doorbellId: d.id,
        doorbellName: d.name,
        timestamp: new Date().toISOString(),
        type: 'press',
        message: d.location,
      })
      play((d.sound as SoundPreset) ?? 'dingdong', { volume: d.volume ?? 1, key: d.id, cooldownMs: 4000 })

      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setActive(null), AUTO_DISMISS_MS)
      break // one ring at a time
    }
  }, [entities, devices, play, pushEvent])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const dismiss = () => {
    if (active) {
      const e = entities[active.device.entityId]
      dismissedRef.current = `${active.device.id}-${e?.last_changed ?? ''}`
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setActive(null)
  }

  return { active, dismiss, devices, autoDismissMs: AUTO_DISMISS_MS }
}
