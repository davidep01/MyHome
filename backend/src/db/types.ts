export interface RoomEntity {
  id: string
  roomId: string
  entityId: string
  label: string
  type:
    | 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media'
    | 'sensor' | 'switch' | 'camera' | 'vacuum' | 'lock' | 'alarm'
  sortOrder: number
  favorite?: boolean
}

export interface Room {
  id: string
  label: string
  icon: string
  sortOrder: number
  entities: RoomEntity[]
}

export interface AppConfig {
  haUrl: string
  haToken: string
  weatherCity: string
  newsCategory: string
  newsFeedUrl: string
  userName: string
  dashboardName: string
  /** HA entity IDs excluded from the auto-discovered dashboard (admin-managed). */
  hiddenEntities: string[]
  /** Per-entity admin overrides: custom name, icon, card type, enable/disable. */
  deviceOverrides?: Record<string, DeviceOverride>
  /** Force temperatures to display in Celsius (converts °F sources). */
  forceCelsius?: boolean
  /** Legacy single doorbell — migrated into `doorbells` on read. */
  doorbell?: DoorbellSettings
  /** Multiple doorbells, each with its own trigger, camera, sound and priority. */
  doorbells?: DoorbellDevice[]
  /** Admin-defined groups: several entities merged into one card. */
  groups?: EntityGroup[]
  /** iOS-style widget home: chosen widgets + their grid positions. */
  home?: HomeConfig
  /** User's custom tile layout (react-grid-layout positions per entity). */
  dashboardLayout?: DashboardLayout
}

export type WidgetType =
  | 'clock' | 'weather' | 'quickStats' | 'scenes' | 'status'
  | 'entity' | 'group' | 'sensor' | 'camera' | 'people'

export type WidgetSize = 'sm' | 'md' | 'lg' | 'wide'

export interface HomeWidget {
  id: string
  type: WidgetType
  size: WidgetSize
  entityId?: string
  groupId?: string
}

export interface HomeConfig {
  widgets: HomeWidget[]
  /** grid position per widget id */
  positions?: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface EntityGroup {
  id: string
  label: string
  /** lucide icon name */
  icon?: string
  /** card type to render the group as (defaults to the first member's domain) */
  type?: string
  entityIds: string[]
}

export interface DoorbellSettings {
  /** event.* / binary_sensor.* entity that fires when the bell rings */
  entityId?: string
  /** camera.* entity framing the door */
  cameraEntityId?: string
}

export type DoorbellPriority = 'low' | 'medium' | 'high' | 'critical'

export interface DoorbellDevice {
  id: string
  name: string
  location?: string
  /** trigger entity (event.* / binary_sensor.*) */
  entityId: string
  cameraEntityId?: string
  /** synth sound preset id, e.g. 'dingdong' | 'chime' | 'alert' | 'none' */
  sound?: string
  /** 0..1 */
  volume?: number
  priority?: DoorbellPriority
  active?: boolean
}

export interface DashboardLayout {
  cols: number
  items: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface DeviceOverride {
  label?: string
  /** lucide icon name, e.g. "lightbulb" */
  icon?: string
  /** override the card type used for this entity */
  type?: string
  /** false = hide from the dashboard (like hiddenEntities, per-entity) */
  enabled?: boolean
}

export interface DbStore {
  config: AppConfig
  rooms: Omit<Room, 'entities'>[]
  entities: RoomEntity[]
}
