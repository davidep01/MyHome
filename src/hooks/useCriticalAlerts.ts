import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { deriveCriticalAlerts } from '../lib/criticalAlerts'

export function useCriticalAlerts() {
  const entities = useEntityStore((state) => state.entities)
  return useMemo(() => deriveCriticalAlerts(entities), [entities])
}
