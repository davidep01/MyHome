import { useEntityStore } from '../store/entities'
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
