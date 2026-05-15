import { useEntityStore } from '../store/entities'
import type { HassEntity } from 'home-assistant-js-websocket'

export function useHAEntity(entityId: string): HassEntity | undefined {
  return useEntityStore((s) => s.entities[entityId])
}

export function useHAConnected(): boolean {
  return useEntityStore((s) => s.connected)
}
