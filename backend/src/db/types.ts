export interface RoomEntity {
  id: string
  roomId: string
  entityId: string
  label: string
  type:
    | 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media'
    | 'sensor' | 'switch' | 'camera' | 'vacuum' | 'lock' | 'alarm'
    | 'number' | 'select' | 'button' | 'binary_sensor' | 'siren' | 'fan'
    | 'automation' | 'script' | 'person' | 'device_tracker' | 'weather' | 'water_heater' | 'valve'
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
  /** Link pubblico iCalendar/ICS mostrato nel widget Calendario. */
  calendarFeedUrl?: string
  userName: string
  dashboardName: string
  /** HA entity IDs excluded from the auto-discovered dashboard (admin-managed). */
  hiddenEntities: string[]
  /** Per-entity admin overrides: custom name, icon, card type, enable/disable. */
  deviceOverrides?: Record<string, DeviceOverride>
  /** Force temperatures to display in Celsius. */
  forceCelsius?: boolean
  /** Advanced mode: allow widget editing on touch devices (tablet/kiosk) too. */
  advancedMode?: boolean
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
  /** Kiosk behaviour: presence wake, adaptive home and local photo screensaver. */
  kiosk?: KioskSettings
  /** Modalità allarme: foto dal tablet e pulsanti di emergenza (§11). */
  alarm?: AlarmSettings
  /** AI features: doorbell Gemini Vision on/off + massimo 8 volti di riferimento. */
  ai?: { doorbellVision?: boolean; faces?: KnownFace[] }
}

/** Volto di riferimento per Gemini Vision (Funzioni → Campanelli → Volti conosciuti). */
export interface KnownFace {
  id: string
  name: string
  /** 1–3 foto frontali come data URL JPEG, ridotte lato client (~512px). */
  images: string[]
}

export interface KioskSettings {
  wakeEntityId?: string
  homeMode?: 'composer' | 'grid'
  /** Profilo prestazioni del tablet: qualità piena, bilanciato (auto) o risparmio. */
  perfProfile?: 'quality' | 'balanced' | 'saver'
  screensaver?: {
    enabled?: boolean
    /** Seconds without interaction before ambient mode starts. */
    idleSeconds?: number
    /** Seconds each local photo stays on screen. */
    slideSeconds?: number
    /** Fully Kiosk screen brightness while ambient mode is visible (0..255). */
    brightness?: number
    /** Sorgente foto: cartella locale (default) o album pubblico Google Foto. */
    source?: 'local' | 'google'
    /** Link pubblico dell'album Google Foto (photos.app.goo.gl / photos.google.com). */
    sourceUrl?: string
    /** Entità incluse nel recap AI; undefined = selezione automatica. */
    recapEntityIds?: string[]
  }
}

/**
 * Azione rapida configurabile (campanello §10.3 / emergenza §11): un bottone
 * con nome pubblico che chiama un servizio HA allowlisted su una entità.
 */
export interface ActionShortcut {
  id: string
  label: string
  /** lucide icon name */
  icon?: string
  entityId: string
  /** servizio esplicito (es. 'turn_on'); se assente lo decide il dominio */
  service?: string
  /** true = pressione prolungata 900ms prima di eseguire (azioni critiche) */
  confirm?: boolean
}

export interface AlarmSettings {
  /** Foto singola dalla fotocamera del tablet quando scatta un'emergenza (opt-in). */
  photo?: boolean
  /** Pulsanti di emergenza nell'overlay critico (sempre a pressione prolungata). */
  shortcuts?: ActionShortcut[]
}

export type WidgetType =
  | 'clock' | 'weather' | 'quickStats' | 'scenes' | 'status'
  | 'entity' | 'group' | 'sensor' | 'camera' | 'people'
  | 'security' | 'system' | 'insight' | 'news' | 'calendar'

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
  /** presentation order, editable by kiosk/tablet without changing widget config */
  order?: string[]
  /** grid position per widget id */
  positions?: Record<string, { x: number; y: number; w: number; h: number }>
  /** optimistic concurrency token for tablet layout saves */
  layoutVersion?: number
  /** last successful layout save timestamp */
  updatedAt?: string
  /** context that wrote the last layout */
  updatedBy?: 'desktop' | 'tablet' | 'migration' | 'system'
  /** backup of the previous valid layout for rollback/recovery */
  lastValidPositions?: Record<string, { x: number; y: number; w: number; h: number }>
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
  /** Serrature apribili dal modale del campanello (hold 900ms ciascuna). */
  lockEntityIds?: string[]
  /** Azioni rapide del modale (max 4): luce ingresso, cancello, scena… */
  shortcuts?: ActionShortcut[]
}

export interface DashboardLayout {
  cols: number
  items: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface DeviceOverride {
  /** Strato "Adesso": 'always' = sempre in evidenza, 'never' = mai. Vuoto = decide il composer. */
  hero?: 'always' | 'never'
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
