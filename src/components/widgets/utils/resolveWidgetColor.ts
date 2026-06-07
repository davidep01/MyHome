import type { HassEntity } from 'home-assistant-js-websocket'
import type { RoomEntity } from '../../../api/backend'
import { mapEntityToWidgetCard } from './mapEntityToWidgetCard'

export function resolveWidgetColor(entity: HassEntity | null | undefined, roomEntity: RoomEntity) {
  const mapped = mapEntityToWidgetCard(entity, roomEntity)
  return { accentColor: mapped.accentColor, gradient: mapped.gradient }
}
