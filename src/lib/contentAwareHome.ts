import type { HassEntities } from 'home-assistant-js-websocket'
import type { DeviceOverride, EntityGroup, HomeWidget, WidgetSize } from '../api/backend'

const MEDIUM_WIDGETS = new Set<HomeWidget['type']>([
  'weather', 'status', 'security', 'system', 'insight', 'calendar',
])

function atLeast(size: WidgetSize, minimum: 'md' | 'lg'): WidgetSize {
  if (minimum === 'md') return size === 'sm' ? 'md' : size
  return size === 'sm' || size === 'md' ? 'lg' : size
}

function entityMinimum(
  widget: HomeWidget,
  entities: HassEntities,
  overrides?: Record<string, DeviceOverride>,
): 'md' | 'lg' | null {
  const entityId = widget.entityId
  if (!entityId) return null
  const domain = entityId.split('.')[0]
  const overrideType = overrides?.[entityId]?.type

  if (domain === 'camera' || overrideType === 'camera') return 'lg'
  if (domain === 'media_player' || overrideType === 'media') return 'md'
  if (['climate', 'alarm_control_panel', 'weather', 'water_heater'].includes(domain)) return 'md'

  const entity = entities[entityId]
  const text = `${entityId} ${String(entity?.attributes?.friendly_name ?? '')}`.toLowerCase()
  if (domain === 'sensor' && ['waste', 'rifiuti', 'raccolta'].some((word) => text.includes(word))) return 'md'
  return null
}

/**
 * Adatta le footprint al contenuto effettivo senza modificare la configurazione
 * salvata. Le card dense crescono prima del bin-packing, quindi non possono
 * invadere quelle vicine; le entità semplici conservano la dimensione scelta.
 */
export function contentAwareHomeWidgets(
  widgets: HomeWidget[],
  entities: HassEntities,
  overrides?: Record<string, DeviceOverride>,
  groups?: EntityGroup[],
): HomeWidget[] {
  return widgets.map((widget) => {
    let size = widget.size
    if (widget.type === 'quickStats' || widget.type === 'scenes') size = 'wide'
    else if (widget.type === 'news' || widget.type === 'camera') size = atLeast(size, 'lg')
    else if (MEDIUM_WIDGETS.has(widget.type)) size = atLeast(size, 'md')
    else if (widget.type === 'group') {
      const count = groups?.find((group) => group.id === widget.groupId)?.entityIds.length ?? 0
      size = atLeast(size, count > 4 ? 'lg' : 'md')
    } else if (widget.type === 'entity' || widget.type === 'sensor') {
      const minimum = entityMinimum(widget, entities, overrides)
      if (minimum) size = atLeast(size, minimum)
    }
    return size === widget.size ? widget : { ...widget, size }
  })
}
