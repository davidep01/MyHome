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
  weatherCity: string
  newsCategory: string
  userName: string
  dashboardName: string
}

export const configApi = {
  get: () => request<AppConfig>('/config'),
  getCredentials: () => request<Pick<AppConfig, 'haUrl' | 'haToken'>>('/config/ha-credentials'),
  update: (data: Partial<AppConfig>) =>
    request<{ ok: boolean }>('/config', { method: 'PUT', body: JSON.stringify(data) }),
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export interface RoomEntity {
  id: string
  roomId: string
  entityId: string
  label: string
  type: 'light' | 'climate' | 'cover' | 'scene' | 'security' | 'media' | 'sensor' | 'switch' | 'camera'
  sortOrder: number
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
