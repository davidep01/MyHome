import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, type AppConfig } from '../api/backend'

export function useDashboardConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    // One global dashboard for every device: SSE pushes changes instantly, and
    // this short polling guarantees convergence even if the SSE stream is
    // blocked/buffered in some environment (kiosk WebView, proxy…).
    staleTime: 2000,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useUpdateConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<AppConfig>) => configApi.update(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['config'] })
      const prev = qc.getQueryData<AppConfig>(['config'])
      qc.setQueryData<AppConfig>(['config'], (old) => old ? { ...old, ...data } : old)
      return { prev }
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(['config'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}
