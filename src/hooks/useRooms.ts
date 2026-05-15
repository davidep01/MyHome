import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { roomsApi, entitiesApi, type RoomEntity } from '../api/backend'

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: roomsApi.getAll,
    staleTime: Infinity,
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { label: string; icon?: string }) => roomsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; label?: string; icon?: string }) =>
      roomsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => roomsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  })
}

export function useAddEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      roomId,
      ...data
    }: { roomId: string; entityId: string; label: string; type: RoomEntity['type'] }) =>
      entitiesApi.add(roomId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  })
}

export function useRemoveEntity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roomId, entityId }: { roomId: string; entityId: string }) =>
      entitiesApi.remove(roomId, entityId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  })
}
