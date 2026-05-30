import { useQuery } from '@tanstack/react-query'
import { haApi, type HAHistoryPoint } from '../api/backend'

export function useHistory(entityId: string | undefined, hours = 1) {
  return useQuery<HAHistoryPoint[]>({
    queryKey: ['ha-history', entityId, hours],
    queryFn: () => haApi.history(entityId!, hours),
    enabled: Boolean(entityId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
