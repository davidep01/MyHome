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
  /** Doorbell fullscreen alert: which entity rings + which camera to show. */
  doorbell?: DoorbellSettings
  /** Admin-defined groups: several entities merged into one card. */
  groups?: EntityGroup[]
  /** User's custom tile layout (react-grid-layout positions per entity). */
  dashboardLayout?: DashboardLayout
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
