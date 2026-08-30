import { useMemo } from 'react'
import { useEntityStore } from '../store/entities'
import { useTabletLayout } from './useTabletLayout'
import { isDashboardCardEntity } from '../lib/entityVisibility'

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
 *
 * Conta soltanto i dispositivi scelti nel wizard: un "7 luci accese" che
 * include lampade che l'utente non ha mai voluto in casa non è un riepilogo
 * della SUA casa, ed è per giunta un bottone che le spegnerebbe tutte.
 */
export function useHomeSummary(): HomeSummary {
  const entities = useEntityStore((s) => s.entities)
  const { data: layout } = useTabletLayout('home')
  const overrides = layout?.deviceOverrides

  return useMemo(() => {
    const all = Object.values(entities).filter((e) => isDashboardCardEntity(e.entity_id, overrides))
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
  }, [entities, overrides])
}
