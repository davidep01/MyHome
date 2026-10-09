import { useEffect, useRef, useState } from 'react'
import { composeHome, type AlertChip, type HeroSlot } from '../lib/composer'
import { isEntityActive, rankBentoEntities, settleBentoOrder, SURFACE_RECENT_MS, surfacedEntityIds } from '../lib/bentoHome'
import { lastCardInteractionAt, readUsage, usageScore } from '../lib/cardUsage'
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
  /** Escluse dal registry di HA (nascoste, disattivate, diagnostiche) e relè duplicati: non si palesano mai. */
  excludedEntities?: Set<string>
}

const TICK_MS = 1000
/** La home si riordina solo dopo 90s senza tocchi, e al massimo una volta al minuto. */
const SETTLE_AFTER_MS = 90_000
const MIN_REORDER_INTERVAL_MS = 60_000
const IDLE: ComposedHomeView = { hero: [], alerts: [], quiet: true }

/**
 * Composizione live della home bento: TUTTI i dispositivi scelti nel wizard,
 * preceduti dalle P0 di sicurezza del composer (visibili anche su dispositivi
 * non configurati), più le card che si PALESANO: un dispositivo comandabile
 * che si accende o cambia stato compare anche se non è nel wizard, e se ne va
 * dopo 10 minuti di quiete (`surfacedEntityIds`). I cambi contano solo se il
 * tablet li vede accadere: un riavvio di HA non fa comparire tutto. L'ordine lo decide `rankBentoEntities` — uso appreso,
 * attività in corso, categoria — e le prime card prendono le tessere grandi.
 * Il riordino avviene solo a home ferma (`settleBentoOrder`): una card non
 * salta via mentre la tocchi. Ogni delta push avvia il ricalcolo; il tick a
 * 1Hz fa maturare le scadenze. Il setState avviene solo se cambia qualcosa.
 */
export function useComposedHome(cfg?: KioskCurationConfig): ComposedHomeView {
  const { areaNameOf, areaIdOf } = useAreaIndex(cfg?.deviceOverrides)
  const [view, setView] = useState<ComposedHomeView>(IDLE)

  const signatureRef = useRef('')
  const orderRef = useRef<{ ids: string[]; at: number }>({ ids: [], at: 0 })
  /** entityId → istante in cui il tablet ha visto cambiare lo stato. */
  const changedAtRef = useRef(new Map<string, number>())
  // In un ref: la curation cambia identità a ogni delta e non deve riavviare l'effetto.
  const excludedRef = useRef<Set<string> | undefined>(cfg?.excludedEntities)
  useEffect(() => { excludedRef.current = cfg?.excludedEntities }, [cfg?.excludedEntities])

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
      const nowMs = Date.now()
      const usage = readUsage()
      const usageOf = (id: string) => usageScore(usage[id], nowMs)
      const activeOf = (id: string) => isEntityActive(entities[id])
      const configured = Object.keys(entities).filter((id) =>
        isDashboardCardEntity(id, deviceOverrides)
        && isRenderableDomain(id)
        && deviceOverrides?.[id]?.hero !== 'never'
        && !safetyIds.has(id))
      const changedAt = changedAtRef.current
      for (const [id, at] of changedAt) if (nowMs - at > SURFACE_RECENT_MS) changedAt.delete(id)
      const excluded = excludedRef.current
      const surfaced = surfacedEntityIds(Object.values(entities), {
        nowMs,
        isConfigured: (id) => isDashboardCardEntity(id, deviceOverrides),
        isExcluded: (id) => Boolean(excluded?.has(id)) || safetyIds.has(id) || !isRenderableDomain(id) || deviceOverrides?.[id]?.hero === 'never',
        changedAt: (id) => changedAt.get(id),
      })
      const surfacedSet = new Set(surfaced)
      // Configurate e di passaggio nello stesso ordine per peso: un dispositivo appena acceso pesa come due tocchi.
      const weighted = rankBentoEntities([...configured, ...surfaced], { nameOf: (id) => entityName(entities[id], deviceOverrides?.[id]?.label), usageOf, activeOf })
      const canReorder = nowMs - lastCardInteractionAt() >= SETTLE_AFTER_MS
        && nowMs - orderRef.current.at >= MIN_REORDER_INTERVAL_MS
      const ordered = settleBentoOrder(orderRef.current.ids, weighted, canReorder)
      if (ordered.join() !== orderRef.current.ids.join()) orderRef.current = { ids: ordered, at: nowMs }
      const hero: HeroSlot[] = [
        ...safety,
        ...ordered.map((id): HeroSlot => ({
          key: id,
          entityId: id,
          priority: 4,
          reason: surfacedSet.has(id) ? (activeOf(id) ? 'Appena acceso' : 'Cambiato da poco')
            : usageOf(id) >= 1 ? 'Usata spesso' : activeOf(id) ? 'In funzione' : 'Configurato',
        })),
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
      if (state.entities !== previous.entities) {
        // Solo transizioni viste dal vivo: il primo snapshot (previous vuoto) non è un "cambio".
        const before = previous.entities
        if (Object.keys(before).length > 0) {
          const at = Date.now()
          for (const [id, entity] of Object.entries(state.entities)) {
            const old = before[id]
            if (old && old !== entity && old.state !== entity.state) changedAtRef.current.set(id, at)
          }
        }
      }
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
