import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { haRegistry, type HAArea } from '../api/ha-registry'
import { useEntityStore } from '../store/entities'
import { resolveAreaId } from '../lib/areaInference'
import type { DeviceOverride } from '../api/backend'

export interface AreaIndex {
  /** Aree HA ordinate per nome (vuoto se il registry non è raggiungibile). */
  areas: HAArea[]
  areaIdOf: (entityId: string) => string | undefined
  areaNameOf: (entityId: string) => string | undefined
  ready: boolean
}

const EMPTY: AreaIndex = { areas: [], areaIdOf: () => undefined, areaNameOf: () => undefined, ready: false }

/**
 * Indice entity_id → area dal registry HA (entità → area diretta, altrimenti
 * l'area del device). Una richiesta condivisa, cache 10 minuti; degrada a
 * indice vuoto se il registry non risponde (es. HA WS giù).
 */
export function useAreaIndex(overrides?: Record<string, DeviceOverride>): AreaIndex {
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')

  const { data } = useQuery({
    queryKey: ['ha-area-index'],
    enabled: connected,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const [areas, devices, entities] = await Promise.all([
        haRegistry.areas(),
        haRegistry.devices(),
        haRegistry.entities(),
      ])
      const deviceArea = new Map(devices.map((d) => [d.id, d.area_id]))
      const entityArea = new Map<string, string>()
      for (const e of entities) {
        const areaId = e.area_id ?? (e.device_id ? deviceArea.get(e.device_id) ?? null : null)
        if (areaId) entityArea.set(e.entity_id, areaId)
      }
      return {
        areas: [...areas].sort((a, b) => a.name.localeCompare(b.name)),
        entityArea,
      }
    },
  })

  return useMemo(() => {
    if (!data) return EMPTY
    const nameById = new Map(data.areas.map((a) => [a.area_id, a.name]))
    // Lo store è letto al momento della chiamata, non sottoscritto: l'identità
    // di areaIdOf/areaNameOf resta stabile fra i delta HA, così il composer non
    // ricrea subscription e tick a ogni aggiornamento di stato sul tablet.
    // L'inferenza è cache-ata per nome: si ricalcola solo se l'entità cambia
    // etichetta, mai a ogni compute del composer.
    const cache = new Map<string, string | undefined>()
    const resolvedAreaId = (entityId: string) => {
      const entity = useEntityStore.getState().entities[entityId]
      const key = `${entityId}|${String(entity?.attributes?.friendly_name ?? '')}`
      const cached = cache.get(key)
      if (cached !== undefined || cache.has(key)) return cached
      const resolved = resolveAreaId({
        entity,
        areas: data.areas,
        registryAreaId: data.entityArea.get(entityId),
        manualAreaId: overrides?.[entityId]?.areaId,
      })
      cache.set(key, resolved)
      return resolved
    }
    return {
      areas: data.areas,
      areaIdOf: resolvedAreaId,
      areaNameOf: (entityId: string) => {
        const id = resolvedAreaId(entityId)
        return id ? nameById.get(id) : undefined
      },
      ready: true,
    }
  }, [data, overrides])
}
