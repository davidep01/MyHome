import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { useDashboardConfig } from './useDashboardConfig'
import { useHAHiddenEntities } from './useHAHiddenEntities'
import type { EntityType, RoomEntity } from '../api/backend'

/** HA domain → dashboard card type. Domains not listed are ignored (infra/system). */
export const DOMAIN_TYPE: Record<string, EntityType> = {
  light: 'light',
  switch: 'switch',
  input_boolean: 'switch',
  fan: 'fan',
  climate: 'climate',
  cover: 'cover',
  lock: 'lock',
  vacuum: 'vacuum',
  camera: 'camera',
  media_player: 'media',
  scene: 'scene',
  alarm_control_panel: 'alarm',
  siren: 'siren',
  number: 'number',
  input_number: 'number',
  select: 'select',
  input_select: 'select',
  button: 'button',
  input_button: 'button',
  remote: 'button',
  binary_sensor: 'binary_sensor',
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
  { domain: 'lock', label: 'Serrature', order: 5 },
  { domain: 'siren', label: 'Sirene', order: 6 },
  { domain: 'vacuum', label: 'Aspirapolvere', order: 7 },
  { domain: 'media_player', label: 'Media', order: 8 },
  { domain: 'camera', label: 'Videocamere', order: 9 },
  { domain: 'scene', label: 'Scene', order: 10 },
  { domain: 'button', label: 'Pulsanti', order: 11 },
  { domain: 'input_button', label: 'Pulsanti', order: 11 },
  { domain: 'remote', label: 'Telecomandi', order: 12 },
  { domain: 'select', label: 'Selettori', order: 13 },
  { domain: 'input_select', label: 'Selettori', order: 13 },
  { domain: 'number', label: 'Regolazioni', order: 14 },
  { domain: 'input_number', label: 'Regolazioni', order: 14 },
  { domain: 'alarm_control_panel', label: 'Allarme', order: 15 },
  { domain: 'binary_sensor', label: 'Stato sensori', order: 16 },
  { domain: 'sensor', label: 'Sensori', order: 17 },
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
  const { data: config } = useDashboardConfig()
  const hidden = config?.hiddenEntities
  const overrides = config?.deviceOverrides
  const haHidden = useHAHiddenEntities()

  return useMemo(() => {
    // Merge: entities hidden via Admin panel + entities hidden inside HA itself.
    const hiddenSet = new Set([...(hidden ?? []), ...haHidden])
    const byDomain = new Map<string, RoomEntity[]>()

    for (const e of Object.values(entities)) {
      if (hiddenSet.has(e.entity_id)) continue
      const ov = overrides?.[e.entity_id]
      if (ov?.enabled === false) continue // per-entity disable
      const domain = e.entity_id.split('.')[0]
      const type = (ov?.type as EntityType | undefined) ?? DOMAIN_TYPE[domain]
      if (!type) continue
      // Skip diagnostic entities (noise) across all domains
      if (e.attributes?.entity_category === 'diagnostic') continue
      // Skip snapshot-only cameras (no STREAM feature) — only show live-capable ones.
      if (domain === 'camera' && !ov?.type) {
        const feat = Number(e.attributes?.supported_features ?? 0)
        const isSnapshotOnly = (feat & 2) === 0 || e.entity_id.endsWith('_snapshot')
        if (isSnapshotOnly) continue
      }

      const item: RoomEntity = {
        id: e.entity_id,
        roomId: 'auto',
        entityId: e.entity_id,
        label: ov?.label || (e.attributes?.friendly_name as string | undefined) || e.entity_id.split('.')[1],
        type,
        sortOrder: 0,
        icon: ov?.icon,
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
  }, [entities, hidden, overrides, haHidden])
}
