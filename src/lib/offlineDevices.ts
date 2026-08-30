import type { HassEntity } from 'home-assistant-js-websocket'
import { isRelevantUnavailableEntity } from './entityCuration'

/**
 * "Chi è offline" per la regia.
 *
 * Il conteggio grezzo delle entità `unavailable` non è una diagnosi: in una
 * casa reale è dominato da tracker BLE fantasma e telemetria di sfondo, che
 * seppelliscono l'unico guasto vero. Qui si applica lo stesso criterio delle
 * notifiche (`isRelevantUnavailableEntity`) e si raggruppa per integrazione,
 * perché quando un'integrazione cade cadono tutte le sue entità insieme: una
 * riga "ezviz — 6 dispositivi" è la diagnosi, sei righe separate sono rumore.
 */

export interface OfflineEntry {
  entityId: string
  name: string
  platform: string
  areaName?: string
  /** ISO dell'ultimo aggiornamento: da quanto è giù. */
  since?: string
}

export interface OfflineIntegration {
  platform: string
  entries: OfflineEntry[]
}

export interface OfflineReport {
  /** Guasti veri, raggruppati per integrazione. */
  integrations: OfflineIntegration[]
  deviceCount: number
  /** Telemetria di sfondo: contata, mai elencata. */
  backgroundCount: number
}

export interface OfflineLookups {
  nameOf: (entity: HassEntity) => string
  platformOf: (entityId: string) => string | undefined
  areaNameOf: (entityId: string) => string | undefined
  /** Entità già escluse dalle superfici utente (nascoste/diagnostiche). */
  excludedEntityIds?: ReadonlySet<string>
}

const UNKNOWN_PLATFORM = 'Altro'

export function buildOfflineReport(entities: HassEntity[], lookups: OfflineLookups): OfflineReport {
  const byPlatform = new Map<string, OfflineEntry[]>()
  let backgroundCount = 0

  for (const entity of entities) {
    if (entity.state !== 'unavailable') continue
    if (lookups.excludedEntityIds?.has(entity.entity_id)) continue
    if (!isRelevantUnavailableEntity(entity)) {
      backgroundCount += 1
      continue
    }
    const platform = lookups.platformOf(entity.entity_id)?.trim() || UNKNOWN_PLATFORM
    const entry: OfflineEntry = {
      entityId: entity.entity_id,
      name: lookups.nameOf(entity),
      platform,
      areaName: lookups.areaNameOf(entity.entity_id),
      since: entity.last_changed ?? entity.last_updated,
    }
    const bucket = byPlatform.get(platform)
    if (bucket) bucket.push(entry)
    else byPlatform.set(platform, [entry])
  }

  const integrations = [...byPlatform.entries()]
    .map(([platform, entries]) => ({
      platform,
      entries: entries.sort((a, b) => a.name.localeCompare(b.name, 'it')),
    }))
    // L'integrazione che ha perso più dispositivi è la diagnosi più probabile.
    .sort((a, b) => b.entries.length - a.entries.length || a.platform.localeCompare(b.platform, 'it'))

  return {
    integrations,
    deviceCount: integrations.reduce((total, group) => total + group.entries.length, 0),
    backgroundCount,
  }
}
