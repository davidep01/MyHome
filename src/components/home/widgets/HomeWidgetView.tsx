import { useEntityStore } from '../../../store/entities'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { SensorStatCard } from '../../widgets/SensorStatCard'
import { CameraCard } from '../../widgets/CameraCard'
import { WeatherWidget } from '../../weather/WeatherWidget'
import { GlassCard } from '../../glass/GlassCard'
import { QuickStats } from '../QuickStats'
import { SceneRow } from '../../layout/SceneRow'
import { PeopleCard } from '../PeopleCard'
import { ClockWidget } from './ClockWidget'
import { StatusWidget } from './StatusWidget'
import type { EntityType, HomeWidget, RoomEntity } from '../../../api/backend'

/** Build a RoomEntity for a bare entity id, honouring admin overrides. */
function useRoomEntity(entityId?: string): RoomEntity | null {
  const entities = useEntityStore((s) => s.entities)
  const { data: config } = useDashboardConfig()
  if (!entityId) return null
  const e = entities[entityId]
  const ov = config?.deviceOverrides?.[entityId]
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

function MissingWidget({ text }: { text: string }) {
  return (
    <GlassCard className="flex h-full items-center justify-center">
      <p className="text-xs text-black/35">{text}</p>
    </GlassCard>
  )
}

export function HomeWidgetView({ widget }: { widget: HomeWidget }) {
  const { data: config } = useDashboardConfig()
  const roomEntity = useRoomEntity(widget.entityId)

  switch (widget.type) {
    case 'clock': return <ClockWidget size={widget.size} />
    case 'status': return <StatusWidget />
    case 'people': return <PeopleCard className="h-full" />
    case 'quickStats':
      return <GlassCard className="flex h-full items-center"><QuickStats /></GlassCard>
    case 'scenes':
      return <GlassCard className="flex h-full items-center overflow-hidden"><SceneRow /></GlassCard>
    case 'weather':
      return <GlassCard className="h-full overflow-hidden"><WeatherWidget /></GlassCard>
    case 'sensor':
      return roomEntity
        ? <SensorStatCard entityId={roomEntity.entityId} label={roomEntity.label} className="h-full" />
        : <MissingWidget text="Sensore non impostato" />
    case 'camera':
      return roomEntity
        ? <CameraCard entityId={roomEntity.entityId} label={roomEntity.label} className="h-full" />
        : <MissingWidget text="Camera non impostata" />
    case 'group': {
      const group = config?.groups?.find((g) => g.id === widget.groupId)
      return group ? <GroupCard group={group} className="h-full" /> : <MissingWidget text="Gruppo non impostato" />
    }
    case 'entity':
      return roomEntity ? <EntityCard entity={roomEntity} /> : <MissingWidget text="Dispositivo non impostato" />
    default:
      return <MissingWidget text="Widget sconosciuto" />
  }
}
