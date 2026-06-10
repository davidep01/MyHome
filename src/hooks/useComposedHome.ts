import { useEffect, useRef, useState } from 'react'
import {
  applyHysteresis,
  composeHome,
  EMPTY_HYSTERESIS,
  type AlertChip,
  type HeroSlot,
  type HysteresisState,
} from '../lib/composer'
import { useEntityStore } from '../store/entities'
import { useHAHiddenEntities } from './useHAHiddenEntities'
import { useAreaIndex } from './useAreaIndex'
import type { DeviceOverride } from '../api/backend'

export interface ComposedHomeView {
  hero: HeroSlot[]
  alerts: AlertChip[]
  quiet: boolean
}

export interface KioskCurationConfig {
  hiddenEntities?: string[]
  deviceOverrides?: Record<string, DeviceOverride>
}

const TICK_MS = 1000
const IDLE: ComposedHomeView = { hero: [], alerts: [], quiet: true }

/**
 * Composizione live della home: ricalcolo throttled a 1Hz sul flusso entità
 * (letto imperativamente dallo store a ogni tick), con isteresi (dwell 45s,
 * max 1 swap/30s, P0 immediato). Il setState avviene solo quando la
 * composizione cambia davvero: a casa quieta la home non ri-renderizza.
 */
export function useComposedHome(cfg?: KioskCurationConfig): ComposedHomeView {
  const haHidden = useHAHiddenEntities()
  const { areaNameOf } = useAreaIndex()
  const [view, setView] = useState<ComposedHomeView>(IDLE)

  const memory = useRef<{ hero: HeroSlot[]; state: HysteresisState; signature: string }>({
    hero: [],
    state: EMPTY_HYSTERESIS,
    signature: '',
  })

  const hiddenEntities = cfg?.hiddenEntities
  const deviceOverrides = cfg?.deviceOverrides

  useEffect(() => {
    const compute = () => {
      const entities = useEntityStore.getState().entities
      const hidden = new Set([...(hiddenEntities ?? []), ...haHidden])
      const visible = Object.values(entities).filter((e) =>
        !hidden.has(e.entity_id)
        && deviceOverrides?.[e.entity_id]?.enabled !== false
        && e.attributes?.entity_category !== 'diagnostic')

      const raw = composeHome(visible, { areaNameOf, now: new Date() })
      const { hero, state } = applyHysteresis(memory.current.hero, raw.hero, memory.current.state, Date.now())

      const next: ComposedHomeView = { hero, alerts: raw.alerts, quiet: hero.length === 0 }
      const signature = JSON.stringify(next)
      const changed = signature !== memory.current.signature
      memory.current = { hero, state, signature }
      if (changed) setView(next)
    }

    compute()
    const id = setInterval(compute, TICK_MS)
    return () => clearInterval(id)
  }, [haHidden, areaNameOf, hiddenEntities, deviceOverrides])

  return view
}
