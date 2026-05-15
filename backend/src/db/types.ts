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

export interface AppConfig {
  haUrl: string
  haToken: string
  weatherCity: string
  newsCategory: string
  newsFeedUrl: string
  userName: string
  dashboardName: string
}

export interface DbStore {
  config: AppConfig
  rooms: Omit<Room, 'entities'>[]
  entities: RoomEntity[]
}
