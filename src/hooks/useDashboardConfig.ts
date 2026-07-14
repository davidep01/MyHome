import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, type AppConfig } from '../api/backend'

// Config writes can originate from several independent cards. Keep a single
// FIFO queue so an older, slower request can never overwrite a newer choice.
let configWriteQueue: Promise<unknown> = Promise.resolve()
let queuedWrites = 0

function enqueueConfigWrite(data: Partial<AppConfig>) {
  queuedWrites += 1
  const request = configWriteQueue.then(() => configApi.update(data))
  configWriteQueue = request.then(
    () => undefined,
    () => undefined,
  )
  return request.finally(() => { queuedWrites -= 1 })
}

export function useDashboardConfig(enabled = true) {
  return useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
    enabled,
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
    mutationFn: enqueueConfigWrite,
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['config'] })
      const prev = qc.getQueryData<AppConfig>(['config'])
      qc.setQueryData<AppConfig>(['config'], (old) => {
        if (!old) return old
        const next = { ...old, ...data }
        // Mirror the server's optimistic-concurrency bump so a rapid second home
        // edit sends a fresh layoutVersion instead of 409-ing against itself.
        if (data.home && Number.isInteger(data.home.layoutVersion)) {
          next.home = { ...data.home, layoutVersion: (data.home.layoutVersion ?? 1) + 1 }
        }
        return next
      })
      const optimistic = qc.getQueryData<AppConfig>(['config'])
      return { prev, optimistic, keys: Object.keys(data) as (keyof AppConfig)[] }
    },
    onError: (_err, _data, ctx) => {
      // Avoid restoring the entire previous object: another card may already
      // have applied a newer optimistic update. Only restore keys that still
      // contain the failed mutation's optimistic value.
      const prev = ctx?.prev
      if (!prev) return
      qc.setQueryData<AppConfig>(['config'], (current) => {
        if (!current) return prev
        const next = { ...current }
        for (const key of ctx.keys) {
          if (Object.is(current[key], ctx.optimistic?.[key])) next[key] = prev[key] as never
        }
        return next
      })
    },
    onSettled: () => {
      if (queuedWrites === 0) void qc.invalidateQueries({ queryKey: ['config'] })
    },
  })
}
