const BASE = '/api'

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
  doorbell?: DoorbellSettings
  groups?: EntityGroup[]
  home?: HomeConfig
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
  positions?: Record<string, { x: number; y: number; w: number; h: number }>
}

export interface DoorbellSettings {
  entityId?: string
  cameraEntityId?: string
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
  getCredentials: () => request<Pick<AppConfig, 'haUrl' | 'haToken'>>('/config/ha-credentials'),
  update: (data: Partial<AppConfig>) =>
    request<{ ok: boolean }>('/config', { method: 'PUT', body: JSON.stringify(data) }),
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export type EntityType =
  | 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media'
  | 'sensor' | 'switch' | 'camera' | 'vacuum' | 'lock' | 'alarm'
  | 'number' | 'select' | 'button' | 'binary_sensor' | 'siren' | 'fan'

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
  service: (domain: string, service: string, data?: Record<string, unknown>) =>
    request<unknown[]>(`/ha/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
  cameraProxyUrl: (entityId: string) => `/api/ha/camera-proxy/${encodeURIComponent(entityId)}`,
  cameraStreamUrl: (entityId: string) => `/api/ha/camera-stream/${encodeURIComponent(entityId)}`,
  mediaUrl: (path: string) => `/api/ha/media?path=${encodeURIComponent(path)}`,
}
