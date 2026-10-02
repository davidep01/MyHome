import { withRetainedCriticalEntities } from '../lib/criticalEpisodes'
import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { deriveCriticalAlerts } from '../lib/criticalAlerts'
import { useAlarmTestStore } from '../store/alarmTest'

export function useCriticalAlerts() {
  const entities = useEntityStore((state) => state.entities)
  const episodes = useEntityStore((state) => state.criticalEpisodes)
  const testAlert = useAlarmTestStore((state) => state.alert)
  return useMemo(() => {
    const real = deriveCriticalAlerts(withRetainedCriticalEntities(entities, episodes)).map((alert) => {
      const current = entities[alert.entityId]
      return !current || ['unknown', 'unavailable'].includes(current.state)
        ? { ...alert, detail: `${alert.detail} · Ultimo avviso noto: stato da verificare` } : alert
    })
    return testAlert ? [...real, testAlert] : real
  }, [entities, episodes, testAlert])
}
