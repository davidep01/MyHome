import type { HassEntities, HassEntity } from 'home-assistant-js-websocket'
import { deriveCriticalAlerts } from './criticalAlerts'

/** Resolve an episode only with a valid state, never with absence/unavailable. */
export function updateCriticalEpisodes(previous: HassEntities, changed: HassEntity[]): HassEntities {
  const next = { ...previous }
  for (const entity of changed) {
    if (!entity || ['unknown', 'unavailable', ''].includes(entity.state)) continue
    if (deriveCriticalAlerts({ [entity.entity_id]: entity }).length) next[entity.entity_id] = entity
    else delete next[entity.entity_id]
  }
  return next
}
export function withRetainedCriticalEntities(entities: HassEntities, episodes: HassEntities = {}): HassEntities {
  const result = { ...entities }
  for (const [id, entity] of Object.entries(episodes)) {
    if (!entities[id] || ['unknown', 'unavailable', ''].includes(entities[id].state)) result[id] = entity
  }
  return result
}
