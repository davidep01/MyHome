import { useMemo } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import { useAreaIndex } from './useAreaIndex'
import { useEntityStore } from '../store/entities'
import { isRenderableDomain } from '../components/home/layers/makeRoomEntity'
import { isDashboardCardEntity } from '../lib/entityVisibility'
import type { DeviceOverride } from '../api/backend'
import { isPresenceEntity } from '../lib/dashboardSelection'

/** Ordine di presentazione dei domini dentro una stanza. */
const DOMAIN_ORDER = ['light', 'switch', 'input_boolean', 'fan', 'humidifier', 'climate', 'cover', 'valve', 'lock', 'media_player', 'camera', 'vacuum', 'lawn_mower', 'scene', 'script', 'sensor', 'binary_sensor']

function domainRank(entityId: string): number {
  const i = DOMAIN_ORDER.indexOf(entityId.split('.')[0])
  return i === -1 ? DOMAIN_ORDER.length : i
}

/** Cosa sta "facendo" la stanza adesso — alimenta chip e catalogo Spazi. */
export type RoomActivity = 'media' | 'heating' | 'cooling' | 'light' | 'fan' | 'vacuum' | null

export interface RoomOverview {
  key: string
  title: string
  entityIds: string[]
  /** Dispositivi attivi (on/playing/cleaning/heat/cool). */
  active: number
  lightsOn: number
  fansOn: number
  coversOpen: number
  unlocked: number
  heating: boolean
  cooling: boolean
  vacuumBusy: boolean
  /** Titolo del media in riproduzione (o nome del player). */
  mediaTitle: string | null
  /** Prima temperatura ambiente disponibile (sensore o clima). */
  temperature: number | null
  /** Attività dominante, per l'icona animata della stanza. */
  activity: RoomActivity
}

function isActive(e: HassEntity): boolean {
  return e.state === 'on' || e.state === 'playing' || e.state === 'cleaning' || e.state === 'heat' || e.state === 'cool'
}

function summarize(key: string, title: string, list: HassEntity[]): RoomOverview {
  let lightsOn = 0
  let fansOn = 0
  let coversOpen = 0
  let unlocked = 0
  let heating = false
  let cooling = false
  let vacuumBusy = false
  let mediaTitle: string | null = null
  let temperature: number | null = null
  let active = 0

  for (const e of list) {
    const domain = e.entity_id.split('.')[0]
    if (isActive(e)) active += 1
    if (domain === 'light' && e.state === 'on') lightsOn += 1
    if (domain === 'fan' && e.state === 'on') fansOn += 1
    if (domain === 'cover' && e.state === 'open') coversOpen += 1
    if (domain === 'lock' && e.state === 'unlocked') unlocked += 1
    if (domain === 'vacuum' && e.state === 'cleaning') vacuumBusy = true
    if (domain === 'lawn_mower' && e.state === 'mowing') vacuumBusy = true
    if (domain === 'climate') {
      const action = String(e.attributes?.hvac_action ?? e.state)
      if (action === 'heating' || e.state === 'heat') heating = true
      if (action === 'cooling' || e.state === 'cool') cooling = true
      const current = Number(e.attributes?.current_temperature)
      if (temperature === null && Number.isFinite(current)) temperature = current
    }
    if (domain === 'media_player' && e.state === 'playing' && !mediaTitle) {
      mediaTitle = (e.attributes?.media_title as string | undefined)
        ?? (e.attributes?.friendly_name as string | undefined)
        ?? 'In riproduzione'
    }
    if (domain === 'sensor' && temperature === null
      && String(e.attributes?.device_class ?? '') === 'temperature') {
      const v = Number(e.state)
      if (Number.isFinite(v)) temperature = v
    }
  }

  const activity: RoomActivity =
    mediaTitle ? 'media'
    : heating ? 'heating'
    : cooling ? 'cooling'
    : lightsOn > 0 ? 'light'
    : fansOn > 0 ? 'fan'
    : vacuumBusy ? 'vacuum'
    : null

  const entityIds = list.map((e) => e.entity_id).sort((a, b) => domainRank(a) - domainRank(b) || a.localeCompare(b))
  return { key, title, entityIds, active, lightsOn, fansOn, coversOpen, unlocked, heating, cooling, vacuumBusy, mediaTitle, temperature, activity }
}

/**
 * Vista per-stanza della casa: entità visibili raggruppate per area HA con i
 * conteggi live di ciò che è attivo. UNICA fonte per le chip Stanze e per il
 * catalogo Spazi (stesso filtro hidden/override/diagnostic della home).
 */
export function useRoomsOverview(cfg?: {
  hiddenEntities?: string[]
  overrides?: Record<string, DeviceOverride>
}): { rooms: RoomOverview[]; ready: boolean } {
  const entities = useEntityStore((s) => s.entities)
  const overrides = cfg?.overrides
  const { areas, areaIdOf, ready } = useAreaIndex(overrides)

  const rooms = useMemo(() => {
    // Opt-in: una stanza contiene solo ciò che è stato configurato nel wizard.
    const visible = Object.values(entities).filter((e) =>
      isDashboardCardEntity(e.entity_id, overrides)
      && !isPresenceEntity(e)
      && isRenderableDomain(e.entity_id))

    const byArea = new Map<string, HassEntity[]>()
    const orphan: HassEntity[] = []
    for (const e of visible) {
      const areaId = areaIdOf(e.entity_id)
      if (areaId) {
        const bucket = byArea.get(areaId)
        if (bucket) bucket.push(e)
        else byArea.set(areaId, [e])
      } else {
        orphan.push(e)
      }
    }

    const list = areas
      .filter((a) => byArea.has(a.area_id))
      .map((a) => summarize(a.area_id, a.name, byArea.get(a.area_id)!))

    if (!ready || list.length === 0) {
      // Registry non disponibile o nessuna area: tutto in una voce sola.
      return visible.length ? [summarize('all', 'Tutti i dispositivi', visible)] : []
    }
    if (orphan.length) list.push(summarize('other', 'Altro', orphan))
    return list
  }, [entities, areas, areaIdOf, ready, overrides])

  return { rooms, ready }
}
