import type { HassEntities } from 'home-assistant-js-websocket'
import type { DeviceOverride, EntityType, RoomEntity } from '../../../api/backend'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'

/**
 * Costruisce il RoomEntity che WidgetCardFactory si aspetta, partendo da un
 * bare entity_id e rispettando gli override admin (nome, tipo, icona).
 * Versione non-hook di useRoomEntity (HomeWidgetView), riusata dagli strati.
 */
export function makeRoomEntity(
  entityId: string,
  entities: HassEntities,
  overrides?: Record<string, DeviceOverride>,
): RoomEntity {
  const e = entities[entityId]
  const ov = overrides?.[entityId]
  const domain = entityId.split('.')[0]
  const type = (ov?.type as EntityType | undefined) ?? DOMAIN_TYPE[domain] ?? 'sensor'
  return {
    id: entityId,
    roomId: 'auto',
    entityId,
    label: ov?.label || (e?.attributes?.friendly_name as string | undefined) || entityId.split('.')[1],
    type,
    sortOrder: 0,
    icon: ov?.icon,
  }
}

/** true se il dominio ha una card renderizzabile in dashboard. */
export function isRenderableDomain(entityId: string): boolean {
  return Boolean(DOMAIN_TYPE[entityId.split('.')[0]])
}
