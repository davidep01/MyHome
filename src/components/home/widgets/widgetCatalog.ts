import { Clock, CloudSun, Gauge, Sparkles, ShieldCheck, ToggleRight, Layers, Activity, Video, Users, Bell, Cpu, Lightbulb, Newspaper, CalendarDays } from 'lucide-react'
import type { WidgetSize, WidgetType } from '../../../api/backend'

// Grid footprint per widget size now lives in the shared layout kernel.
// Re-exported here for backward-compatible imports.
export { SIZE_WH } from '../../../lib/homeLayout'

export const SIZE_LABEL: Record<WidgetSize, string> = {
  sm: 'S · 1 slot', md: 'M · 2 slot', lg: 'L · 3 slot, alta', wide: 'XL · 3 slot, panoramica',
}

const ALL_SIZES: WidgetSize[] = ['sm', 'md', 'lg', 'wide']

export interface WidgetMeta {
  label: string
  Icon: React.ElementType
  sizes: WidgetSize[]
  defaultSize: WidgetSize
  /** what the widget must be bound to */
  needs?: 'entity' | 'group' | 'sensor' | 'camera'
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  clock: { label: 'Orologio', Icon: Clock, sizes: ALL_SIZES, defaultSize: 'md' },
  weather: { label: 'Meteo', Icon: CloudSun, sizes: ALL_SIZES, defaultSize: 'md' },
  quickStats: { label: 'Riepilogo casa', Icon: Gauge, sizes: ALL_SIZES, defaultSize: 'md' },
  scenes: { label: 'Scene', Icon: Sparkles, sizes: ALL_SIZES, defaultSize: 'wide' },
  status: { label: 'Stato casa', Icon: ShieldCheck, sizes: ALL_SIZES, defaultSize: 'sm' },
  people: { label: 'Persone', Icon: Users, sizes: ALL_SIZES, defaultSize: 'md' },
  security: { label: 'Accessi', Icon: Bell, sizes: ALL_SIZES, defaultSize: 'md' },
  system: { label: 'Sistema', Icon: Cpu, sizes: ALL_SIZES, defaultSize: 'md' },
  insight: { label: 'Insight', Icon: Lightbulb, sizes: ALL_SIZES, defaultSize: 'md' },
  news: { label: 'News', Icon: Newspaper, sizes: ALL_SIZES, defaultSize: 'lg' },
  calendar: { label: 'Calendario', Icon: CalendarDays, sizes: ALL_SIZES, defaultSize: 'md' },
  entity: { label: 'Dispositivo', Icon: ToggleRight, sizes: ALL_SIZES, defaultSize: 'sm', needs: 'entity' },
  group: { label: 'Gruppo', Icon: Layers, sizes: ALL_SIZES, defaultSize: 'md', needs: 'group' },
  sensor: { label: 'Sensore', Icon: Activity, sizes: ALL_SIZES, defaultSize: 'sm', needs: 'sensor' },
  camera: { label: 'Videocamera', Icon: Video, sizes: ALL_SIZES, defaultSize: 'lg', needs: 'camera' },
}

export const WIDGET_ORDER: WidgetType[] = [
  'clock', 'status', 'quickStats', 'insight', 'weather', 'calendar', 'news',
  'security', 'system', 'scenes', 'people', 'entity', 'group', 'sensor', 'camera',
]
