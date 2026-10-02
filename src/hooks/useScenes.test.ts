import { describe, expect, it } from 'vitest'
import type { HassEntities } from 'home-assistant-js-websocket'
import { deriveHomeScenes } from './useScenes'

const entities = Object.fromEntries(['selected', 'unselected', 'hidden', 'offline'].map((id) => {
  const entity_id = `scene.${id}`
  return [entity_id, { entity_id, state: id === 'offline' ? 'unavailable' : '2026-10-02T00:00:00Z', attributes: { friendly_name: id } }]
})) as HassEntities
const overrides = { 'scene.selected': { enabled: true }, 'scene.hidden': { enabled: true }, 'scene.offline': { enabled: true } }
describe('home scene curation', () => {
  it('keeps only configured scenes and disables unavailable scenes', () => {
    const scenes = deriveHomeScenes(entities, overrides, new Set(['scene.hidden']), true)
    expect(scenes.map((scene) => scene.entityId)).toEqual(['scene.offline', 'scene.selected'])
    expect(scenes[0].unavailableReason).toBe('Scena non disponibile')
    expect(scenes[1].unavailableReason).toBeUndefined()
  })
  it('disables cached scene actions while HA is offline', () => {
    expect(deriveHomeScenes(entities, overrides, new Set(), false).every((scene) => scene.unavailableReason === 'Home Assistant non connesso')).toBe(true)
    expect(deriveHomeScenes(entities, undefined, new Set(), true)).toEqual([])
  })
})
