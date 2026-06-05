import { create } from 'zustand'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'

export type HAConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

interface EntityStore {
  entities: HassEntities
  connected: boolean
  connectionStatus: HAConnectionStatus
  lastError?: string
  /** Temperature unit from HA's unit system ('°C' | '°F'). */
  temperatureUnit: string
  setEntities: (entities: HassEntities) => void
  setConnected: (connected: boolean) => void
  setConnectionStatus: (status: HAConnectionStatus, error?: string) => void
  setTemperatureUnit: (unit: string) => void
  patchEntity: (entityId: string, patch: Partial<HassEntity>) => void
  setOptimisticState: (entityId: string, state: string, attributes?: Record<string, unknown>) => void
  getEntity: (entityId: string) => HassEntity | undefined
}

export const useEntityStore = create<EntityStore>((set, get) => ({
  entities: {},
  connected: false,
  connectionStatus: 'idle',
  temperatureUnit: '°C',
  setTemperatureUnit: (temperatureUnit) => set({ temperatureUnit }),
  setEntities: (entities) => set({ entities }),
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
