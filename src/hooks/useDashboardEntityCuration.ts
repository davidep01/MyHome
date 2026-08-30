import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { haRegistry } from '../api/ha-registry'
import { dashboardExcludedEntityIds, duplicateSwitchProxyEntityIds } from '../lib/entityCuration'
import { useEntityStore } from '../store/entities'

const EMPTY_EXCLUDED = new Set<string>()

/** Entities that must stay out of user-facing kiosk surfaces by default. */
export function useDashboardEntityCuration(): Set<string> {
  const connected = useEntityStore((state) => state.connectionStatus === 'connected')
  const entities = useEntityStore((state) => state.entities)
  const { data } = useQuery({
    queryKey: ['ha-entity-registry-dashboard-curation'],
    enabled: connected,
    staleTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () => dashboardExcludedEntityIds(await haRegistry.entities()),
  })
  return useMemo(() => {
    const duplicateRelays = duplicateSwitchProxyEntityIds(entities)
    if (!data && duplicateRelays.size === 0) return EMPTY_EXCLUDED
    return new Set([...(data ?? EMPTY_EXCLUDED), ...duplicateRelays])
  }, [data, entities])
}
