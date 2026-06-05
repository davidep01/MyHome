import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'

export interface HomeSummary {
  lightsOn: number
  lightIds: string[]
  climateActive: number
  coversOpen: number
  mediaPlaying: number
  avgIndoorTemp: number | null
}

/**
 * At-a-glance live state of the house, computed from the HA entity store.
 * Powers the home summary strip (counts + one-tap actions).
 */
export function useHomeSummary(): HomeSummary {
  const entities = useEntityStore((s) => s.entities)

  return useMemo(() => {
    const all = Object.values(entities)
    const lightIds = all
      .filter((e) => e.entity_id.startsWith('light.') && e.state === 'on')
      .map((e) => e.entity_id)

    const climateActive = all.filter(
      (e) => e.entity_id.startsWith('climate.') && e.state !== 'off' && e.state !== 'unavailable',
    ).length

    const coversOpen = all.filter(
      (e) => e.entity_id.startsWith('cover.') && e.state === 'open',
    ).length

    const mediaPlaying = all.filter(
      (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing',
    ).length

    const temps = all
      .filter((e) => e.entity_id.startsWith('sensor.') && e.attributes?.device_class === 'temperature')
      .map((e) => Number(e.state))
      .filter((n) => Number.isFinite(n))
    const avgIndoorTemp = temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null

    return {
      lightsOn: lightIds.length,
      lightIds,
      climateActive,
      coversOpen,
      mediaPlaying,
      avgIndoorTemp,
    }
  }, [entities])
}
