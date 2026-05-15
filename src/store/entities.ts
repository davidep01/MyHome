import { create } from 'zustand'
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'

interface EntityStore {
  entities: HassEntities
  connected: boolean
  setEntities: (entities: HassEntities) => void
  setConnected: (connected: boolean) => void
  getEntity: (entityId: string) => HassEntity | undefined
}

export const useEntityStore = create<EntityStore>((set, get) => ({
  entities: {},
  connected: false,
  setEntities: (entities) => set({ entities }),
  setConnected: (connected) => set({ connected }),
  getEntity: (entityId) => get().entities[entityId],
}))
