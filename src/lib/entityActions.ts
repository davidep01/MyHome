import { useEntityStore } from '../store/entities'
import { noteCardUsage } from './cardUsage'
const pending = new Set<string>()
export function entityActionPending(entityId: string): boolean { return pending.has(entityId) }

/** Shared guard across every surface, with rollback only while our optimistic state is current. */
export async function performEntityAction(
  entityId: string, start: () => void, task: () => Promise<unknown>, rollback?: () => void,
): Promise<void> {
  if (pending.has(entityId)) throw new Error('Comando già in esecuzione')
  const state = useEntityStore.getState()
  const entity = state.entities[entityId]
  if (!state.connected || !entity || ['unknown', 'unavailable'].includes(entity.state)) throw new Error('Dispositivo non disponibile')
  if (entityId.startsWith('lock.') && ['locking', 'unlocking'].includes(entity.state)) throw new Error('Serratura in movimento')
  pending.add(entityId)
  // Ogni comando reale su un dispositivo insegna alla home cosa usi davvero.
  noteCardUsage(entityId)
  try {
    start()
    const optimistic = useEntityStore.getState().entities[entityId]
    try { await task() }
    catch (error) {
      if (useEntityStore.getState().entities[entityId] === optimistic) rollback?.()
      throw error
    }
  } finally { pending.delete(entityId) }
}

/** Reserve the entire group before sending its single HA command. */
export async function performGroupAction(entityIds: string[], start: () => void, task: () => Promise<unknown>, rollback: (id: string) => void): Promise<void> {
  const ids = [...new Set(entityIds)]
  const store = useEntityStore.getState()
  if (!ids.length || !store.connected || ids.some(id => pending.has(id) || !store.entities[id] || ['unknown', 'unavailable'].includes(store.entities[id].state))) throw new Error('Gruppo non disponibile')
  ids.forEach(id => pending.add(id))
  try {
    start()
    const optimistic = new Map(ids.map(id => [id, useEntityStore.getState().entities[id]]))
    try { await task() } catch (error) {
      ids.forEach(id => { if (useEntityStore.getState().entities[id] === optimistic.get(id)) rollback(id) })
      throw error
    }
  } finally { ids.forEach(id => pending.delete(id)) }
}
