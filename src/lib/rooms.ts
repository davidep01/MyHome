import type { Room } from '../api/backend'

export function withAllRoom(rooms: Room[] = []): Room[] {
  return [
    {
      id: 'all',
      label: 'Tutto',
      icon: 'home',
      sortOrder: -1,
      entities: rooms.flatMap((room) => room.entities),
    },
    ...rooms,
  ]
}
