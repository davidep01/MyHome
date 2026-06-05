import { useMemo } from 'react'
import { useDashboardConfig } from './useDashboardConfig'
import { useEntityStore } from '../store/entities'
import type { EntityGroup } from '../api/backend'

/** Admin-defined groups whose members actually exist in the live entity store. */
export function useGroups(): EntityGroup[] {
  const { data: config } = useDashboardConfig()
  const entities = useEntityStore((s) => s.entities)
  const groups = config?.groups

  return useMemo(() => {
    if (!groups?.length) return []
    return groups
      .map((g) => ({ ...g, entityIds: g.entityIds.filter((id) => entities[id]) }))
      .filter((g) => g.entityIds.length > 0)
  }, [groups, entities])
}
