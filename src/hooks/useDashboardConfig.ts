import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, type AppConfig } from '../api/backend'

export function useDashboardConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    staleTime: Infinity,
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
