import { useQuery } from '@tanstack/react-query'
import { useEntityStore } from '../store/entities'
import { haRegistry } from '../api/ha-registry'

/**
 * Map of entity_id → integration platform (e.g. 'ring', 'ezviz'), from the HA
 * entity registry. Used to scope companion entities (like Ring's per-sensor
 * `*_bypass_mode` selects) to the alarm panel they belong to.
 *
 * Fetched once per session via the WebSocket registry, cached 10 minutes.
 */
export function useEntityPlatforms(): Record<string, string> {
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')

  const { data } = useQuery({
    queryKey: ['ha-entity-registry-platforms'],
    enabled: connected,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const entries = await haRegistry.entities()
      const map: Record<string, string> = {}
      for (const e of entries) if (e.platform) map[e.entity_id] = e.platform
      return map
    },
  })

  return data ?? {}
}
