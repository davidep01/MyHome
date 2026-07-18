import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { deriveCriticalAlerts } from '../lib/criticalAlerts'
import { useAlarmTestStore } from '../store/alarmTest'

export function useCriticalAlerts() {
  const entities = useEntityStore((state) => state.entities)
  const testAlert = useAlarmTestStore((state) => state.alert)
  return useMemo(() => {
    const real = deriveCriticalAlerts(entities)
    return testAlert ? [...real, testAlert] : real
  }, [entities, testAlert])
}
