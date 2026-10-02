import { describe, expect, it } from 'vitest'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useEntityStore } from '../store/entities'
import { deriveCriticalAlerts, criticalAlertEventKey } from './criticalAlerts'
import { withRetainedCriticalEntities } from './criticalEpisodes'
const smoke = { entity_id: 'binary_sensor.smoke', state: 'on', attributes: { device_class: 'smoke' }, last_changed: '2026-10-02T10:00:00Z' } as HassEntity
describe('critical episode continuity', () => {
  it('keeps a known alarm through empty hydration and unavailable, resolves only a valid off state', () => {
    const store = useEntityStore.getState()
    store.setSourceGeneration('episode-installation')
    store.setEntities({ [smoke.entity_id]: smoke })
    const key = criticalAlertEventKey(deriveCriticalAlerts(store.getEntity(smoke.entity_id) ? { [smoke.entity_id]: smoke } : {})[0])
    store.setEntities({})
    expect(useEntityStore.getState().hydrated).toBe(false)
    store.applyEntityDelta([{ ...smoke, state: 'unavailable' }], [])
    const current = useEntityStore.getState()
    expect(criticalAlertEventKey(deriveCriticalAlerts(withRetainedCriticalEntities(current.entities, current.criticalEpisodes))[0])).toBe(key)
    store.setEntities({ [smoke.entity_id]: smoke })
    expect(criticalAlertEventKey(deriveCriticalAlerts(useEntityStore.getState().criticalEpisodes)[0])).toBe(key)
    store.applyEntityDelta([{ ...smoke, state: 'off' }], [])
    expect(useEntityStore.getState().criticalEpisodes).toEqual({})
  })
  it('clears the previous installation and ignores a late retired generation', () => {
    const store = useEntityStore.getState()
    store.setSourceGeneration('old-installation')
    store.setEntities({ [smoke.entity_id]: smoke })
    store.setSourceGeneration('new-installation')
    expect(useEntityStore.getState().criticalEpisodes).toEqual({})
    store.setSourceGeneration('old-installation')
    expect(useEntityStore.getState().sourceGeneration).toBe('new-installation')
  })
})
