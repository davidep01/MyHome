import { create } from 'zustand'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'

export type HAConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

interface EntityStore {
  entities: HassEntities
  connected: boolean
  connectionStatus: HAConnectionStatus
  lastError?: string
  setEntities: (entities: HassEntities) => void
  /**
   * Merges a coalesced delta batch in ONE store update. Unchanged entities
   * keep their object reference, so per-entity selectors (useHAEntity) skip
   * re-rendering everything that didn't move.
   */
  applyEntityDelta: (changed: HassEntity[], removed: string[]) => void
  setConnected: (connected: boolean) => void
  setConnectionStatus: (status: HAConnectionStatus, error?: string) => void
  patchEntity: (entityId: string, patch: Partial<HassEntity>) => void
  setOptimisticState: (entityId: string, state: string, attributes?: Record<string, unknown>) => void
  getEntity: (entityId: string) => HassEntity | undefined
}

export const useEntityStore = create<EntityStore>((set, get) => ({
  entities: {},
  connected: false,
  connectionStatus: 'idle',
  setEntities: (entities) => set({ entities }),
  applyEntityDelta: (changed, removed) => set((s) => {
    if (changed.length === 0 && removed.length === 0) return s
    const entities: HassEntities = { ...s.entities }
    for (const entity of changed) entities[entity.entity_id] = entity
    for (const id of removed) delete entities[id]
    return { entities }
  }),
  setConnected: (connected) => set({ connected }),
  setConnectionStatus: (connectionStatus, lastError) => set({
    connectionStatus,
    connected: connectionStatus === 'connected',
    lastError,
  }),
  patchEntity: (entityId, patch) => set((s) => {
    const current = s.entities[entityId]
    if (!current) return s
    return {
      entities: {
        ...s.entities,
        [entityId]: {
          ...current,
          ...patch,
          attributes: { ...current.attributes, ...patch.attributes },
        },
      },
    }
  }),
  setOptimisticState: (entityId, state, attributes = {}) => set((s) => {
    const current = s.entities[entityId]
    if (!current) return s
    return {
      entities: {
        ...s.entities,
        [entityId]: {
          ...current,
          state,
          attributes: { ...current.attributes, ...attributes },
          last_changed: new Date().toISOString(),
        },
      },
    }
  }),
  getEntity: (entityId) => get().entities[entityId],
}))
