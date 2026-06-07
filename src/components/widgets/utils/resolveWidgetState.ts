import type { HassEntity } from 'home-assistant-js-websocket'
import type { RoomEntity } from '../../../api/backend'
import { mapEntityToWidgetCard } from './mapEntityToWidgetCard'

export function resolveWidgetState(entity: HassEntity | null | undefined, roomEntity: RoomEntity) {
  return mapEntityToWidgetCard(entity, roomEntity).status
}
