import type { HassEntity } from 'home-assistant-js-websocket'
import type { RoomEntity } from '../../../api/backend'
import { mapEntityToWidgetCard } from './mapEntityToWidgetCard'

export function resolveWidgetIcon(entity: HassEntity | null | undefined, roomEntity: RoomEntity) {
  return mapEntityToWidgetCard(entity, roomEntity).Icon
}
