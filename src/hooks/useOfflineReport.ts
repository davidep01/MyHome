import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { haRegistry } from '../api/ha-registry'
import { entityName } from '../components/widgets/utils/mapEntityToWidgetCard'
import { buildOfflineReport, type OfflineReport } from '../lib/offlineDevices'
import { useEntityStore } from '../store/entities'
import { useAreaIndex } from './useAreaIndex'
import { useDashboardEntityCuration } from './useDashboardEntityCuration'

const EMPTY: OfflineReport = { integrations: [], deviceCount: 0, backgroundCount: 0 }

/** Guasti veri (per integrazione) separati dalla telemetria di sfondo. */
export function useOfflineReport(): OfflineReport {
  const entities = useEntityStore((state) => state.entities)
  const connected = useEntityStore((state) => state.connectionStatus === 'connected')
  const excludedEntityIds = useDashboardEntityCuration()
  const { areaNameOf } = useAreaIndex()

  const { data: platformById } = useQuery({
    queryKey: ['ha-registry-platforms'],
    enabled: connected,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => new Map(
      (await haRegistry.entities()).map((entry) => [entry.entity_id, entry.platform ?? undefined]),
    ),
  })

  return useMemo(() => {
    const list = Object.values(entities)
    if (list.length === 0) return EMPTY
    return buildOfflineReport(list, {
      nameOf: (entity) => entityName(entity),
      platformOf: (entityId) => platformById?.get(entityId),
      areaNameOf,
      excludedEntityIds,
    })
  }, [entities, platformById, areaNameOf, excludedEntityIds])
}
