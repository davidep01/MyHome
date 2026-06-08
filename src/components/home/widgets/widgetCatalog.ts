import { Clock, CloudSun, Gauge, Sparkles, ShieldCheck, ToggleRight, Layers, Activity, Video, Users, Bell, Cpu, Lightbulb, Newspaper, CalendarDays } from 'lucide-react'
import type { WidgetSize, WidgetType } from '../../../api/backend'

// Grid footprint per widget size now lives in the shared layout kernel.
// Re-exported here for backward-compatible imports.
export { SIZE_WH } from '../../../lib/homeLayout'

export const SIZE_LABEL: Record<WidgetSize, string> = {
  sm: 'Piccolo', md: 'Medio', lg: 'Grande', wide: 'Largo',
}

export interface WidgetMeta {
  label: string
  Icon: React.ElementType
  sizes: WidgetSize[]
  /** what the widget must be bound to */
  needs?: 'entity' | 'group' | 'sensor' | 'camera'
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  clock: { label: 'Orologio', Icon: Clock, sizes: ['sm', 'md'] },
  weather: { label: 'Meteo', Icon: CloudSun, sizes: ['md', 'lg'] },
  quickStats: { label: 'Riepilogo casa', Icon: Gauge, sizes: ['wide', 'md'] },
  scenes: { label: 'Scene', Icon: Sparkles, sizes: ['wide'] },
  status: { label: 'Stato casa', Icon: ShieldCheck, sizes: ['sm', 'md'] },
  people: { label: 'Persone', Icon: Users, sizes: ['sm', 'md'] },
  security: { label: 'Accessi', Icon: Bell, sizes: ['sm', 'md', 'lg'] },
  system: { label: 'Sistema', Icon: Cpu, sizes: ['sm', 'md'] },
  insight: { label: 'Insight', Icon: Lightbulb, sizes: ['md', 'wide'] },
  news: { label: 'News', Icon: Newspaper, sizes: ['md', 'lg', 'wide'] },
  calendar: { label: 'Calendario', Icon: CalendarDays, sizes: ['sm', 'md', 'lg'] },
  entity: { label: 'Dispositivo', Icon: ToggleRight, sizes: ['sm', 'md'], needs: 'entity' },
  group: { label: 'Gruppo', Icon: Layers, sizes: ['sm', 'md'], needs: 'group' },
  sensor: { label: 'Sensore', Icon: Activity, sizes: ['sm', 'md'], needs: 'sensor' },
  camera: { label: 'Videocamera', Icon: Video, sizes: ['md', 'lg'], needs: 'camera' },
}

export const WIDGET_ORDER: WidgetType[] = [
  'clock', 'status', 'quickStats', 'insight', 'weather', 'calendar', 'news',
  'security', 'system', 'scenes', 'people', 'entity', 'group', 'sensor', 'camera',
]
