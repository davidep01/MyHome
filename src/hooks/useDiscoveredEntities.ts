import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import type { EntityType, RoomEntity } from '../api/backend'

/** HA domain → dashboard card type. Domains not listed are ignored (infra/system). */
const DOMAIN_TYPE: Record<string, EntityType> = {
  light: 'light',
  switch: 'switch',
  input_boolean: 'switch',
  fan: 'switch',
  climate: 'climate',
  cover: 'cover',
  lock: 'lock',
  vacuum: 'vacuum',
  camera: 'camera',
  media_player: 'media',
  scene: 'scene',
  alarm_control_panel: 'alarm',
  sensor: 'sensor',
}

/** Section ordering + Italian labels for each discovered domain. */
const DOMAIN_META: { domain: string; label: string; order: number; minColumn?: number }[] = [
  { domain: 'light', label: 'Luci', order: 0 },
  { domain: 'switch', label: 'Interruttori', order: 1 },
  { domain: 'input_boolean', label: 'Interruttori', order: 1 },
  { domain: 'fan', label: 'Ventilazione', order: 2 },
  { domain: 'climate', label: 'Clima', order: 3 },
  { domain: 'cover', label: 'Tapparelle e tende', order: 4 },
  { domain: 'lock', label: 'Serrature', order: 5, minColumn: 160 },
  { domain: 'vacuum', label: 'Aspirapolvere', order: 6 },
  { domain: 'media_player', label: 'Media', order: 7 },
  { domain: 'camera', label: 'Videocamere', order: 8, minColumn: 240 },
  { domain: 'scene', label: 'Scene', order: 9 },
  { domain: 'alarm_control_panel', label: 'Allarme', order: 10 },
  { domain: 'sensor', label: 'Sensori', order: 11 },
]

export interface DiscoveredSection {
  domain: string
  label: string
  minColumn?: number
  entities: RoomEntity[]
}

/**
 * Builds dashboard sections directly from the live Home Assistant entity store.
 * Auto-updates whenever HA pushes new states/entities over the WebSocket.
 */
export function useDiscoveredEntities(): { sections: DiscoveredSection[]; total: number } {
  const entities = useEntityStore((s) => s.entities)

  return useMemo(() => {
    const byDomain = new Map<string, RoomEntity[]>()

    for (const e of Object.values(entities)) {
      const domain = e.entity_id.split('.')[0]
      const type = DOMAIN_TYPE[domain]
      if (!type) continue
      // Skip diagnostic/config sensors with no friendly value
      if (domain === 'sensor' && e.attributes?.entity_category === 'diagnostic') continue

      const item: RoomEntity = {
        id: e.entity_id,
        roomId: 'auto',
        entityId: e.entity_id,
        label: (e.attributes?.friendly_name as string | undefined) ?? e.entity_id.split('.')[1],
        type,
        sortOrder: 0,
      }
      const list = byDomain.get(domain) ?? []
      list.push(item)
      byDomain.set(domain, list)
    }

    const sections = DOMAIN_META
      .filter((m) => byDomain.has(m.domain))
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        domain: m.domain,
        label: m.label,
        minColumn: m.minColumn,
        entities: (byDomain.get(m.domain) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
      }))

    const total = sections.reduce((n, s) => n + s.entities.length, 0)
    return { sections, total }
  }, [entities])
}
