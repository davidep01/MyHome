import { useQuery } from '@tanstack/react-query'
import { useEntityStore } from '../store/entities'
import { haRegistry } from '../api/ha-registry'

/**
 * Returns the Set of entity IDs that are hidden in Home Assistant
 * (Settings → Entities → hidden_by !== null).
 *
 * Fetched once per session via the HA WebSocket registry and cached for
 * 10 minutes. Re-fetched automatically when the WS reconnects.
 */
export function useHAHiddenEntities(): Set<string> {
  const connected = useEntityStore((s) => s.connectionStatus === 'connected')

  const { data } = useQuery({
    queryKey: ['ha-entity-registry-hidden'],
    enabled: connected,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const entries = await haRegistry.entities()
      return new Set(
        entries
          .filter((e) => e.hidden_by !== null && e.hidden_by !== undefined)
          .map((e) => e.entity_id),
      )
    },
  })

  return data ?? new Set()
}
