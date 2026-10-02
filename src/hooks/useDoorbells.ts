import { doorbellStateValid, doorbellTriggered } from '../lib/doorbellTransitions'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEntityStore } from '../store/entities'
import { useDashboardConfig } from './useDashboardConfig'
import { useSoundNotifications } from './useSoundNotifications'
import { useDoorbellEvents } from '../store/doorbellEvents'
import { normalizeDoorbells } from '../lib/doorbell'
import { uid } from '../lib/uid'
import type { DoorbellDevice } from '../api/backend'
import { startRepeatingSound, type SoundPreset } from '../lib/sound/SoundManager'

const AUTO_DISMISS_MS = 30_000
const RING_REPEAT_MS = 3_000

interface ActiveRing {
  device: DoorbellDevice
  ringAt: number
  /** Tests exercise video/audio only and must never upload camera data. */
  test?: boolean
}

/**
 * Watches every configured doorbell at once. On a rising edge it raises a single
 * active ring (which doorbell + its camera), logs the event and plays that
 * doorbell's sound. `event.*` entities ring on any state change (timestamp);
 * other domains ring on entering an active state.
 */
export function useDoorbells(deviceOverride?: DoorbellDevice[]) {
  const { data: config } = useDashboardConfig(deviceOverride === undefined)
  const connected = useEntityStore((s) => s.connected)
  const entities = useEntityStore((s) => s.entities)
  const devices = useMemo(() => deviceOverride?.filter((device) => device.active !== false && Boolean(device.entityId)) ?? normalizeDoorbells(config), [config, deviceOverride])
  const { play } = useSoundNotifications()
  const pushEvent = useDoorbellEvents((s) => s.push)

  const [active, setActive] = useState<ActiveRing | null>(null)
  const prevStates = useRef<Record<string, string | undefined>>({})
  const dismissedRef = useRef<string | null>(null)
  const pendingRings = useRef<ActiveRing[]>([])
  const activeRef = useRef<ActiveRing | null>(null)
  const devicesRef = useRef(devices)
  const seenRings = useRef(new Set<string>())
  const seenTests = useRef(new Set<number>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const testRing = useDoorbellEvents((s) => s.testRing)

  const showRing = (ring: ActiveRing | null) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    activeRef.current = ring
    setActive(ring)
    if (ring) timerRef.current = setTimeout(nextRing, AUTO_DISMISS_MS)
  }
  const nextRing = () => {
    // eslint-disable-next-line react-hooks/purity -- lifecycle helper runs only from effects, timers and dismissal events.
    const now = Date.now()
    const next = pendingRings.current.find((ring) => now - ring.ringAt < 45_000
      && devicesRef.current.some((device) => device.id === ring.device.id))
    pendingRings.current = next ? pendingRings.current.slice(pendingRings.current.indexOf(next) + 1) : []
    showRing(next ?? null)
  }

  useEffect(() => {
    devicesRef.current = devices
    pendingRings.current = pendingRings.current.filter((ring) => devices.some((device) => device.id === ring.device.id))
    if (activeRef.current && !devices.some((device) => device.id === activeRef.current!.device.id)) nextRing()
    // Only configuration membership matters here; lifecycle helpers use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices])

  useEffect(() => {
    if (!testRing || seenTests.current.has(testRing.at) || Date.now() - testRing.at > 10_000) return
    const device = devices.find((candidate) => candidate.id === testRing.doorbellId)
    if (!device) return
    seenTests.current.add(testRing.at)
    pendingRings.current = []
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external SSE test event drives this lifecycle.
    showRing({ device, ringAt: Date.now(), test: true })
    pushEvent({ id: uid('ev'), doorbellId: device.id, doorbellName: device.name,
      timestamp: new Date().toISOString(), type: 'press', message: 'Suonata di prova' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRing])

  useEffect(() => {
    if (!connected) { prevStates.current = {}; return }
    const rings: ActiveRing[] = []
    for (const device of devices) {
      const entity = entities[device.entityId]
      const state = entity?.state
      const previous = prevStates.current[device.entityId]
      // Every baseline is consumed before selecting a ring; later devices
      // cannot be spuriously rediscovered on an unrelated HA update.
      prevStates.current[device.entityId] = doorbellStateValid(state) ? state : undefined
      if (!doorbellTriggered(device.entityId, previous, state, entity?.last_changed)) continue
      const key = `${device.id}-${entity?.last_changed ?? state}`
      if (dismissedRef.current === key || seenRings.current.has(key)) continue
      seenRings.current.add(key)
      if (seenRings.current.size > 128) seenRings.current.delete(seenRings.current.values().next().value!)
      rings.push({ device, ringAt: Date.now(), test: false })
      pushEvent({ id: uid('ev'), doorbellId: device.id, doorbellName: device.name,
        timestamp: new Date().toISOString(), type: 'press', message: device.location })
    }
    pendingRings.current.push(...rings)
    pendingRings.current = pendingRings.current.slice(0, 4)
    if (!activeRef.current && pendingRings.current.length) nextRing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, devices, connected, pushEvent])

  // Il richiamo continua per l'intera vita dell'overlay: scadenza automatica,
  // pulsante Chiudi/Ignora/Visto o una nuova suonata fermano sempre il timer.
  useEffect(() => {
    if (!active) return
    const ring = () => play((active.device.sound as SoundPreset) ?? 'dingdong', {
      volume: active.device.volume ?? 1,
      boost: 1.5,
      key: `doorbell:${active.device.id}:${active.ringAt}`,
      cooldownMs: 0,
    })
    return startRepeatingSound(ring, RING_REPEAT_MS)
  }, [active, play])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const dismiss = () => {
    if (active) {
      const e = entities[active.device.entityId]
      dismissedRef.current = `${active.device.id}-${e?.last_changed ?? ''}`
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    nextRing()
  }

  const currentDevice = active && devices.find((device) => device.id === active.device.id)
  const visibleActive = useMemo(() => active && currentDevice ? { ...active, device: currentDevice } : null, [active, currentDevice])
  return { active: visibleActive, dismiss, devices, autoDismissMs: AUTO_DISMISS_MS }
}
