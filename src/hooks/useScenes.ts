import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'

export interface HomeScene {
  entityId: string
  label: string
  icon: string
  color: string
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
export function useScenes(): HomeScene[] {
  const entities = useEntityStore((s) => s.entities)
  return useMemo(() => {
    const live = Object.values(entities)
      .filter((e) => e.entity_id.startsWith('scene.'))
      .map((e) => {
        const label =
          (e.attributes?.friendly_name as string | undefined) ??
          e.entity_id.split('.')[1].replace(/_/g, ' ')
        const st = styleFor(`${label} ${e.entity_id}`)
        return { entityId: e.entity_id, label, icon: st.icon, color: st.color }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
    // Never render speculative scene buttons: if HA does not expose the entity,
    // the control would look live but every tap would fail.
    return live
  }, [entities])
}
