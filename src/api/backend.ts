const BASE = '/api'

function clientContext(): 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop'
  return window.matchMedia('(pointer: fine)').matches ? 'desktop' : 'tablet'
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-MyHome-Client': clientContext(),
      ...(options?.headers ?? {}),
    },
    ...options,
  })
  if (!res.ok) throw new Error(`Backend ${options?.method ?? 'GET'} ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

// ── Config ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  haUrl: string
  haToken: string
  haConfigSource?: {
    url: 'env' | 'db' | 'default'
    token: 'env' | 'db' | 'missing'
  }
  haConfigLocked?: {
    haUrl: boolean
    haToken: boolean
  }
  storage?: {
    writable: boolean
    mode: 'file' | 'supabase' | 'read-only'
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
  source?: 'backend' | 'cache'
}

export interface TabletLayoutPatch {
  layoutVersion: number
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
      headers: { 'X-MyHome-Client': 'tablet' },
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
  states: () => request<unknown[]>('/ha/states'),
  state: (entityId: string) => request<unknown>(`/ha/states/${encodeURIComponent(entityId)}`),
  /** HA registries (areas/devices/entities), proxied over the backend WS. */
  registry: () => request<{ areas: unknown[]; devices: unknown[]; entities: unknown[] }>('/ha/registry'),
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
}
