import { useEntityStore } from '../../../store/entities'
import { useDashboardConfig } from '../../../hooks/useDashboardConfig'
import { DOMAIN_TYPE } from '../../../hooks/useDiscoveredEntities'
import { EntityCard } from '../../widgets/WidgetGrid'
import { GroupCard } from '../../widgets/GroupCard'
import { WeatherWidget } from '../../weather/WeatherWidget'
import { GlassCard } from '../../glass/GlassCard'
import { QuickStats } from '../QuickStats'
import { SceneRow } from '../../layout/SceneRow'
import { PeopleCard } from '../PeopleCard'
import { NewsWidget } from '../../news/NewsWidget'
import { ClockWidget } from './ClockWidget'
import { StatusWidget } from './StatusWidget'
import { SecurityWidget } from './SecurityWidget'
import { SystemStatusWidget } from './SystemStatusWidget'
import { QuickInsightWidget } from './QuickInsightWidget'
import { CalendarWidget } from './CalendarWidget'
import { AnimatedCard } from '../../anim/AnimatedCard'
import type { EntityType, HomeWidget, RoomEntity, TabletDashboardLayout } from '../../../api/backend'
import { widgetVisualSizeFromHomeSize } from '../../widgets/utils/getWidgetSizeConfig'

type PublicWidgetConfig = Pick<TabletDashboardLayout, 'deviceOverrides' | 'groups' | 'userName'>

/** Build a RoomEntity for a bare entity id, honouring admin overrides. */
function useRoomEntity(entityId?: string, publicConfig?: PublicWidgetConfig): RoomEntity | null {
  const entities = useEntityStore((s) => s.entities)
  const { data: fullConfig } = useDashboardConfig(!publicConfig)
  const config = publicConfig ?? fullConfig
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

export function HomeWidgetView({ widget, publicConfig }: { widget: HomeWidget; publicConfig?: PublicWidgetConfig }) {
  const { data: fullConfig } = useDashboardConfig(!publicConfig)
  const config = publicConfig ?? fullConfig
  const roomEntity = useRoomEntity(widget.entityId, publicConfig)
  const visualSize = widgetVisualSizeFromHomeSize(widget.size)

  switch (widget.type) {
    case 'clock': return <ClockWidget size={widget.size} userName={config?.userName} />
    case 'status': return <StatusWidget />
    case 'security': return <SecurityWidget size={widget.size} />
    case 'system': return <SystemStatusWidget />
    case 'insight': return <QuickInsightWidget />
    case 'calendar': return <CalendarWidget size={widget.size} />
    case 'news':
      return <AnimatedCard depth ambient="drift" ambientColor="rgba(239,68,68,0.16)" index={3} className="h-full overflow-hidden"><NewsWidget /></AnimatedCard>
    case 'people': return <PeopleCard className="h-full" />
    case 'quickStats':
      return <AnimatedCard depth ambient="drift" ambientColor="rgba(16,185,129,0.16)" index={4} className="flex h-full items-center"><QuickStats /></AnimatedCard>
    case 'scenes':
      return <AnimatedCard depth ambient="drift" ambientColor="rgba(99,102,241,0.16)" index={5} className="flex h-full items-center overflow-hidden"><SceneRow /></AnimatedCard>
    case 'weather':
      return <AnimatedCard depth ambient="drift" index={2} ambientColor="rgba(41,151,255,0.19)" noPadding className="h-full"><div className="h-full overflow-hidden p-[14px]"><WeatherWidget /></div></AnimatedCard>
    case 'sensor':
      return roomEntity
        ? <EntityCard entity={roomEntity} size={visualSize} />
        : <MissingWidget text="Sensore non impostato" />
    case 'camera':
      return roomEntity
        ? <EntityCard entity={roomEntity} size={visualSize} />
        : <MissingWidget text="Camera non impostata" />
    case 'group': {
      const group = config?.groups?.find((g) => g.id === widget.groupId)
      return group ? <GroupCard group={group} className="h-full" /> : <MissingWidget text="Gruppo non impostato" />
    }
    case 'entity':
      return roomEntity ? <EntityCard entity={roomEntity} size={visualSize} /> : <MissingWidget text="Dispositivo non impostato" />
    default:
      return <MissingWidget text="Widget sconosciuto" />
  }
}
