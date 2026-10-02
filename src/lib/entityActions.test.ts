import { afterEach, describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { performEntityAction } from './entityActions'
const entity = { entity_id: 'lock.entry', state: 'locked', attributes: {}, last_changed: '2026-10-02T10:00:00Z' } as HassEntity
afterEach(() => useEntityStore.getState().setEntities({}))
describe('shared entity transactions', () => {
  it('blocks a duplicate action across surfaces and preserves a newer HA update on failure', async () => {
    useEntityStore.getState().setEntities({ 'lock.entry': entity })
    useEntityStore.getState().setConnectionStatus('connected')
    let reject!: (error: Error) => void
    const first = performEntityAction('lock.entry', () => useEntityStore.getState().setOptimisticState('lock.entry', 'unlocking'),
      () => new Promise((_resolve, fail) => { reject = fail }),
      () => useEntityStore.getState().setOptimisticState('lock.entry', 'locked'))
    await expect(performEntityAction('lock.entry', () => {}, async () => {})).rejects.toThrow('già in esecuzione')
    useEntityStore.getState().applyEntityDelta([{ ...entity, state: 'unlocked' }], [])
    reject(new Error('response lost'))
    await expect(first).rejects.toThrow('response lost')
    expect(useEntityStore.getState().entities['lock.entry'].state).toBe('unlocked')
  })
  it('rolls back only its own optimistic state and refuses unavailable devices', async () => {
    useEntityStore.getState().setEntities({ 'lock.entry': entity })
    useEntityStore.getState().setConnectionStatus('connected')
    await expect(performEntityAction('lock.entry', () => useEntityStore.getState().setOptimisticState('lock.entry', 'unlocking'),
      async () => { throw new Error('HA rejected') }, () => useEntityStore.getState().setOptimisticState('lock.entry', 'locked'))).rejects.toThrow()
    expect(useEntityStore.getState().entities['lock.entry'].state).toBe('locked')
    useEntityStore.getState().setConnectionStatus('error')
    await expect(performEntityAction('lock.entry', () => {}, async () => {})).rejects.toThrow('non disponibile')
  })
})
