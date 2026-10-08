import { useEffect, useRef, useState } from 'react'
import { composeHome, type AlertChip, type HeroSlot } from '../lib/composer'
import { orderBentoEntities } from '../lib/bentoHome'
import { entityName } from '../components/widgets/utils/mapEntityToWidgetCard'
import { isRenderableDomain } from '../components/home/layers/makeRoomEntity'
import { computeInsights, type InsightAction } from '../lib/insights'
import { useEntityStore } from '../store/entities'
import { useAreaIndex } from './useAreaIndex'
import { isDashboardCardEntity } from '../lib/entityVisibility'
import type { DeviceOverride } from '../api/backend'

/** Chip dell'header: anomalia del composer o suggerimento con azione proposta. */
export type HomeChip = AlertChip & { action?: InsightAction }

export interface ComposedHomeView {
  hero: HeroSlot[]
  alerts: HomeChip[]
  quiet: boolean
}

export interface KioskCurationConfig {
  /** Conservato per compatibilità del layout pubblico; con l'opt-in non decide più nulla. */
  hiddenEntities?: string[]
  deviceOverrides?: Record<string, DeviceOverride>
}

const TICK_MS = 1000
const IDLE: ComposedHomeView = { hero: [], alerts: [], quiet: true }

/**
 * Composizione live della home bento: TUTTI i dispositivi scelti nel wizard,
 * in ordine stabile (`orderBentoEntities`), preceduti dalle P0 di sicurezza
 * del composer — che restano visibili anche su dispositivi non configurati.
 * L'insieme non dipende da cosa è acceso, quindi niente isteresi: una card
 * non sparisce né salta di posto quando la tocchi. Ogni delta push avvia il
 * ricalcolo; il tick a 1Hz resta per le scadenze temporali (es. notte). Il
 * setState avviene solo quando la composizione cambia davvero.
 */
export function useComposedHome(cfg?: KioskCurationConfig): ComposedHomeView {
  const { areaNameOf, areaIdOf } = useAreaIndex(cfg?.deviceOverrides)
  const [view, setView] = useState<ComposedHomeView>(IDLE)

  const signatureRef = useRef('')

  const deviceOverrides = cfg?.deviceOverrides

  useEffect(() => {
    const compute = () => {
      const { entities, connected, hydrated } = useEntityStore.getState()
      // Il composer riceve TUTTE le entità: decide lui cosa diventa card
      // (solo il configurato) e cosa resta comunque visibile (le P0 di
      // sicurezza, il riepilogo offline). Filtrare qui spegnerebbe gli allarmi
      // sui dispositivi non ancora configurati.
      const raw = composeHome(Object.values(entities), {
        areaNameOf,
        heroOf: (id) => deviceOverrides?.[id]?.hero,
        showWhenActive: (id) => deviceOverrides?.[id]?.showWhenActive === true,
        isConfigured: (id) => isDashboardCardEntity(id, deviceOverrides),
        now: new Date(),
      })
      const safety = raw.hero.filter((slot) => slot.priority === 0)
      const safetyIds = new Set(safety.map((slot) => slot.entityId))
      const configured = orderBentoEntities(
        Object.keys(entities).filter((id) =>
          isDashboardCardEntity(id, deviceOverrides)
          && isRenderableDomain(id)
          && deviceOverrides?.[id]?.hero !== 'never'
          && !safetyIds.has(id)),
        (id) => entityName(entities[id], deviceOverrides?.[id]?.label),
      )
      const hero: HeroSlot[] = [
        ...safety,
        ...configured.map((id): HeroSlot => ({ key: id, entityId: id, priority: 4, reason: 'Configurato' })),
      ]
      const insights = connected && hydrated !== false ? computeInsights(
        Object.values(entities).filter((e) => isDashboardCardEntity(e.entity_id, deviceOverrides)),
        { areaIdOf, nowMs: Date.now() },
      ) : []

      const next: ComposedHomeView = { hero, alerts: [...raw.alerts, ...insights], quiet: hero.length === 0 }
      const signature = JSON.stringify(next)
      if (signature === signatureRef.current) return
      signatureRef.current = signature
      setView(next)
    }

    compute()
    const unsubscribe = useEntityStore.subscribe((state, previous) => {
      if (state.entities !== previous.entities || state.connected !== previous.connected) compute()
    })
    const id = setInterval(compute, TICK_MS)
    return () => {
      unsubscribe()
      clearInterval(id)
    }
  }, [areaNameOf, areaIdOf, deviceOverrides])

  return view
}
