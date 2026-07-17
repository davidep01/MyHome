const BASE = '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function clientContext(): 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop'
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0]
  if (firstSegment && ['kiosk', 'tablet', 'dashboard'].includes(firstSegment)) return 'tablet'
  if (firstSegment && ['entities', 'functions', 'system', 'backend', 'admin', 'settings'].includes(firstSegment)) return 'desktop'
  return window.matchMedia('(pointer: fine)').matches ? 'desktop' : 'tablet'
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { headers: optionHeaders, ...requestOptions } = options ?? {}
  const res = await fetch(`${BASE}${path}`, {
    ...requestOptions,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-MyHome-Client': clientContext(),
      ...(optionHeaders ?? {}),
    },
  })
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('myhome:auth-required'))
    }
    const payload = await res.json().catch(() => null) as { error?: unknown; action?: unknown } | null
    const detail = typeof payload?.error === 'string' ? payload.error : `Errore ${res.status}`
    const action = typeof payload?.action === 'string' ? ` ${payload.action}` : ''
    throw new ApiError(`${detail}${action}`, res.status)
  }
  return res.json() as Promise<T>
}

export interface AuthStatus {
  mode: 'disabled' | 'required' | 'misconfigured'
  authenticated: boolean
  role: 'admin' | 'kiosk' | null
  kioskEnabled: boolean
  message?: string
}

export const authApi = {
  status: () => request<AuthStatus>('/auth/status'),
  login: (token: string) => request<{ ok: true; role: 'admin' | 'kiosk' }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST', body: '{}' }),
}

export interface ScreensaverPhoto {
  name: string
  url: string
  updatedAt: string
}

export interface ScreensaverList {
  photos: ScreensaverPhoto[]
  source: 'local-folder' | 'google-photos'
  /** Presente quando la sorgente remota non è raggiungibile (fallback a locale). */
  error?: string
}

export const screensaverApi = {
  list: () => request<ScreensaverList>('/screensaver'),
}

// ── Config ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  haUrl: string
  haToken: string
  haConfigSource?: {
    url: 'env' | 'db' | 'default' | 'invalid'
    token: 'env' | 'db' | 'missing'
  }
  haConfigLocked?: {
    haUrl: boolean
    haToken: boolean
  }
  storage?: {
    writable: boolean
    mode: 'file' | 'read-only'
  }
  weatherCity: string
  newsCategory: string
  newsFeedUrl: string
  userName: string
  dashboardName: string
  hiddenEntities?: string[]
  deviceOverrides?: Record<string, DeviceOverride>
  forceCelsius?: boolean
  advancedMode?: boolean
  doorbell?: DoorbellSettings
  doorbells?: DoorbellDevice[]
  groups?: EntityGroup[]
  home?: HomeConfig
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
    idleSeconds?: number
    slideSeconds?: number
    brightness?: number
    /** Sorgente foto: cartella locale (default) o album pubblico Google Foto. */
    source?: 'local' | 'google'
    sourceUrl?: string
  }
}

/**
 * Azione rapida configurabile (campanello / emergenza): un bottone con nome
 * pubblico che chiama un servizio HA allowlisted su una entità.
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
  order?: string[]
  positions?: Record<string, { x: number; y: number; w: number; h: number }>
  layoutVersion?: number
  updatedAt?: string
  updatedBy?: 'desktop' | 'tablet' | 'migration' | 'system'
  lastValidPositions?: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface DoorbellSettings {
  entityId?: string
  cameraEntityId?: string
}

export type DoorbellPriority = 'low' | 'medium' | 'high' | 'critical'

export interface DoorbellDevice {
  id: string
  name: string
  location?: string
  entityId: string
  cameraEntityId?: string
  sound?: string
  volume?: number
  priority?: DoorbellPriority
  active?: boolean
  /** Serrature apribili dal modale del campanello (hold 900ms ciascuna). */
  lockEntityIds?: string[]
  /** Azioni rapide del modale (max 4): luce ingresso, cancello, scena… */
  shortcuts?: ActionShortcut[]
}

export interface EntityGroup {
  id: string
  label: string
  icon?: string
  type?: EntityType
  entityIds: string[]
}

export interface DashboardLayout {
  cols: number
  items: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface DeviceOverride {
  /** Strato "Adesso": 'always' = sempre in evidenza, 'never' = mai. Vuoto = decide il composer. */
  hero?: 'always' | 'never'
  label?: string
  icon?: string
  type?: EntityType
  enabled?: boolean
}

export const configApi = {
  get: () => request<AppConfig>('/config'),
  update: (data: Partial<AppConfig>) =>
    request<{ ok: boolean }>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  exportBackup: () => request<{ version: number; exportedAt: string; store: unknown }>('/config/export'),
  importBackup: (backup: unknown) =>
    request<{ ok: boolean }>('/config/import', { method: 'POST', body: JSON.stringify(backup) }),
}

// ── Tablet layout (kiosk-safe, no admin writes) ─────────────────────────────

export interface DashboardPosition {
  x: number
  y: number
  w: number
  h: number
}

export interface TabletDashboardLayout {
  schemaVersion: 1
  dashboardId: string
  widgets: HomeWidget[]
  layout: {
    cols: number
    rowHeight: number
    items: Record<string, DashboardPosition>
    order: string[]
  }
  layoutVersion: number
  updatedAt: string
  updatedBy: 'desktop' | 'tablet' | 'migration' | 'system'
  userName: string
  dashboardName: string
  groups: EntityGroup[]
  doorbells: DoorbellDevice[]
  deviceOverrides: Record<string, DeviceOverride>
  /** Curation data the kiosk needs to filter discovery (not secret). */
  hiddenEntities?: string[]
  kiosk?: KioskSettings
  alarm?: AlarmSettings
  ai?: { doorbellVision?: boolean }
  source?: 'backend' | 'cache'
}

export interface TabletLayoutPatch {
  layoutVersion: number
  /** Full new widget set when adding/removing/resizing; omit for a plain reorder. */
  widgets?: HomeWidget[]
  items: Record<string, DashboardPosition>
  order?: string[]
}

export const layoutApi = {
  get: (dashboardId = 'home') =>
    request<TabletDashboardLayout>(`/layout/${encodeURIComponent(dashboardId)}`, {
      headers: { 'X-MyHome-Client': 'tablet' },
    }),
  update: (dashboardId: string, data: TabletLayoutPatch) =>
    request<TabletDashboardLayout>(`/layout/${encodeURIComponent(dashboardId)}`, {
      method: 'PUT',
      // In authenticated deployments the signed session decides the role.
      // The desktop hint only keeps local auth-disabled development editable.
      headers: { 'X-MyHome-Client': 'desktop' },
      body: JSON.stringify(data),
    }),
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export type EntityType =
  | 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media'
  | 'sensor' | 'switch' | 'camera' | 'vacuum' | 'lock' | 'alarm'
  | 'number' | 'select' | 'button' | 'binary_sensor' | 'siren' | 'fan'
  | 'automation' | 'script' | 'person' | 'device_tracker' | 'weather' | 'water_heater' | 'valve'

export interface RoomEntity {
  id: string
  roomId: string
  entityId: string
  label: string
  type: EntityType
  sortOrder: number
  /** Surfaced in the home "Preferiti" section when true. */
  favorite?: boolean
  /** Optional admin-override lucide icon name. */
  icon?: string
}

export interface Room {
  id: string
  label: string
  icon: string
  sortOrder: number
  entities: RoomEntity[]
}

export const roomsApi = {
  getAll: () => request<Room[]>('/rooms'),
  create: (data: { label: string; icon?: string }) =>
    request<Room>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { label?: string; icon?: string; sortOrder?: number }) =>
    request<Room>(`/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/rooms/${id}`, { method: 'DELETE' }),
  reorder: (items: { id: string; sortOrder: number }[]) =>
    request<{ ok: boolean }>('/rooms/reorder', { method: 'PUT', body: JSON.stringify(items) }),
}

export const entitiesApi = {
  getAll: (roomId: string) => request<RoomEntity[]>(`/rooms/${roomId}/entities`),
  add: (roomId: string, data: { entityId: string; label: string; type: RoomEntity['type'] }) =>
    request<RoomEntity>(`/rooms/${roomId}/entities`, { method: 'POST', body: JSON.stringify(data) }),
  update: (roomId: string, entityId: string, data: { label?: string; type?: RoomEntity['type'] }) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/entities/${entityId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (roomId: string, entityId: string) =>
    request<{ ok: boolean }>(`/rooms/${roomId}/entities/${entityId}`, { method: 'DELETE' }),
}

// ── Home Assistant proxy ───────────────────────────────────────────────────

export interface HAHistoryPoint {
  state: string
  last_changed: string
  last_updated: string
  attributes?: Record<string, unknown>
}

export const haApi = {
  history: (entityId: string, hours = 1) =>
    request<HAHistoryPoint[]>(`/ha/history/${encodeURIComponent(entityId)}?hours=${hours}`),
  states: (signal?: AbortSignal) => request<unknown[]>('/ha/states', { signal }),
  state: (entityId: string) => request<unknown>(`/ha/states/${encodeURIComponent(entityId)}`),
  /** HA registries (areas/devices/entities), proxied over the backend WS. */
  registry: () => request<{ areas: unknown[]; devices: unknown[]; entities: unknown[] }>('/ha/registry'),
  /** Logbook filtrato alle classi significative (timeline di casa). */
  logbook: (hours = 24) =>
    request<{ entity_id: string; name?: string; state?: string; when?: string; message?: string }[]>(`/ha/logbook?hours=${hours}`),
  /** Backend-signed HLS playlist URL for a camera (token stays server-side). */
  cameraHlsUrl: (entityId: string) =>
    request<{ url: string }>(`/ha/camera-hls-url/${encodeURIComponent(entityId)}`),
  service: (domain: string, service: string, data?: Record<string, unknown>) =>
    request<unknown[]>(`/ha/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
  cameraProxyUrl: (entityId: string) => `/api/ha/camera-proxy/${encodeURIComponent(entityId)}`,
  cameraStreamUrl: (entityId: string) => `/api/ha/camera-stream/${encodeURIComponent(entityId)}`,
  mediaUrl: (path: string) => `/api/ha/media?path=${encodeURIComponent(path)}`,
  /** CSP-safe image URL for HA-relative and public HTTPS artwork. */
  imageUrl: (source: string, entityId?: string) => source.startsWith('data:') || source.startsWith('blob:')
    ? source
    : `/api/ha/image?url=${encodeURIComponent(source)}${entityId ? `&entity=${encodeURIComponent(entityId)}` : ''}`,
  /** Suonata di prova: rimbalza via SSE su tutti i client (tablet incluso). */
  doorbellTest: (doorbellId: string) =>
    request<{ ok: boolean }>('/ha/doorbell-test', { method: 'POST', body: JSON.stringify({ doorbellId }) }),
}

// ── Allarme (§11): foto singola dal tablet ──────────────────────────────────

export interface AlarmPhotoUpload {
  /** data URL JPEG dalla fotocamera del tablet */
  image: string
  alertId: string
  takenAt: string
  deviceId?: string
}

export interface AlarmPhotoInfo {
  name: string
  url: string
  takenAt: string
}

export const alarmApi = {
  uploadPhoto: (photo: AlarmPhotoUpload) =>
    request<{ ok: true }>('/alarm/photo', { method: 'POST', body: JSON.stringify(photo) }),
  listPhotos: () => request<{ photos: AlarmPhotoInfo[] }>('/alarm/photos'),
}

// ── Flotta kiosk (§4.5/§12) ─────────────────────────────────────────────────

export interface KioskHeartbeatPayload {
  deviceId: string
  name?: string
  battery?: number
  charging?: boolean
  screenOn?: boolean
  brightness?: number
  screensaver?: boolean
  page?: string
  memoryMb?: number
}

export interface KioskDeviceStatus extends KioskHeartbeatPayload {
  lastSeenAt: string
  online: boolean
}

export const kioskApi = {
  heartbeat: (payload: KioskHeartbeatPayload) =>
    request<{ ok: true }>('/kiosk/heartbeat', { method: 'POST', body: JSON.stringify(payload) }),
  devices: () => request<{ devices: KioskDeviceStatus[] }>('/kiosk/devices'),
  command: (target: string, command: string, value?: number | string) =>
    request<{ ok: true }>('/kiosk/command', { method: 'POST', body: JSON.stringify({ target, command, ...(value !== undefined ? { value } : {}) }) }),
}

export interface AuditEntry {
  at: string
  role: 'admin' | 'kiosk'
  domain: string
  service: string
  entityIds: string[]
}

// ── System status (regia) ───────────────────────────────────────────────────

export interface SystemStatus {
  ha: {
    reachable: boolean
    latencyMs: number | null
    message?: string
    url: string
    source: { url: 'env' | 'db' | 'default' | 'invalid'; token: 'env' | 'db' | 'missing' }
    locked: { haUrl: boolean; haToken: boolean }
  }
  stream: {
    mode: 'idle' | 'ws' | 'poll'
    wsState: 'idle' | 'connecting' | 'connected'
    subscribers: number
    entities: number
    pollMs: number
    lastEventId: number
    lastEventAt: string | null
  }
  storage: { mode: 'file' | 'read-only'; writable: boolean }
  integrations: { gemini: boolean; openweather: boolean }
  now: string
}

export const systemApi = {
  status: () => request<SystemStatus>('/system/status'),
  audit: () => request<{ entries: AuditEntry[] }>('/system/audit'),
}
