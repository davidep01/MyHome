import { useMemo } from 'react'
import type { HassEntities } from 'home-assistant-js-websocket'
import { useTabletLayout } from './useTabletLayout'
import { useDashboardEntityCuration } from './useDashboardEntityCuration'
import type { DeviceOverride } from '../api/backend'
import { isConfiguredEntity } from '../lib/entityVisibility'
import { useEntityStore } from '../store/entities'

export interface HomeScene {
  entityId: string
  label: string
  icon: string
  color: string
  unavailableReason?: string
}

/** Pick an icon + accent for a scene from keywords in its name. */
const STYLES: { match: RegExp; icon: string; color: string }[] = [
  { match: /nott|sleep|dormi|buonanotte/i, icon: 'moon', color: '#7c5cff' },
  { match: /mattin|sveglia|buongiorno|wake|alba/i, icon: 'sunrise', color: '#ff9f0a' },
  { match: /film|cinema|movie|tv|serie/i, icon: 'film', color: '#ff453a' },
  { match: /music|musica|party|festa|relax|chill/i, icon: 'music', color: '#e8508d' },
  { match: /fuori|away|esci|uscit|leav|via/i, icon: 'door-open', color: '#0a84ff' },
  { match: /arriv|rientr|casa|home|benvenut/i, icon: 'house', color: '#30b15a' },
]

function styleFor(text: string) {
  for (const s of STYLES) if (s.match.test(text)) return s
  return { icon: 'sparkles', color: '#0a84ff' }
}

/**
 * Live scenes straight from Home Assistant (scene.* entities), with an icon and
 * accent inferred from the name. Only entities confirmed by the live HA state
 * are rendered, so the home never shows a scene button that cannot run.
 */
export function deriveHomeScenes(entities: HassEntities, overrides: Record<string, DeviceOverride> | undefined, excluded: ReadonlySet<string>, connected: boolean): HomeScene[] {
  return Object.values(entities)
    .filter((e) => e.entity_id.startsWith('scene.') && isConfiguredEntity(e.entity_id, overrides) && !excluded.has(e.entity_id))
    .map((e) => {
      const label = overrides?.[e.entity_id]?.label || (e.attributes?.friendly_name as string | undefined) || e.entity_id.split('.')[1].replace(/_/g, ' ')
      const st = styleFor(`${label} ${e.entity_id}`)
      const unavailableReason = !connected ? 'Home Assistant non connesso' : ['unavailable', 'unknown'].includes(e.state) ? 'Scena non disponibile' : undefined
      return { entityId: e.entity_id, label, icon: st.icon, color: st.color, ...(unavailableReason ? { unavailableReason } : {}) }
    }).sort((a, b) => a.label.localeCompare(b.label))
}

export function useScenes(): HomeScene[] {
  const entities = useEntityStore((s) => s.entities)
  const connected = useEntityStore((s) => s.connected)
  const { data: layout } = useTabletLayout('home')
  const registryExcluded = useDashboardEntityCuration()
  return useMemo(() => deriveHomeScenes(entities, layout?.deviceOverrides,
    new Set([...registryExcluded, ...(layout?.hiddenEntities ?? [])]), connected), [entities, connected, layout, registryExcluded])
}
