import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, type AppConfig } from '../api/backend'

// Config writes can originate from several independent cards. Keep a single
// FIFO queue so an older, slower request can never overwrite a newer choice.
let configWriteQueue: Promise<unknown> = Promise.resolve()
let queuedWrites = 0
const failedOptimisticValues = new Map<keyof AppConfig, Map<unknown, unknown>>()
export const isConfigWritePending = () => queuedWrites > 0

function enqueueConfigWrite(data: Partial<AppConfig>) {
  const request = configWriteQueue.then(() => configApi.update(data))
  configWriteQueue = request.then(
    () => undefined,
    () => undefined,
  )
  return request.finally(() => { queuedWrites -= 1 })
}

export function useDashboardConfig(enabled = true) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['config'],
    queryFn: () => isConfigWritePending() && qc.getQueryData<AppConfig>(['config']) ? Promise.resolve(qc.getQueryData<AppConfig>(['config'])!) : configApi.get(),
    enabled,
    // One global dashboard for every device: SSE pushes changes instantly, and
    // this short polling guarantees convergence even if the SSE stream is
    // blocked/buffered in some environment (kiosk WebView, proxy…).
    staleTime: 2000,
    refetchInterval: () => isConfigWritePending() ? false : 4000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useUpdateConfig() {
  const qc = useQueryClient()
  // Capture the revision the form rendered. Two edits based on an older
  // object must conflict rather than silently authorize stale nested fields.
  const renderVersion = qc.getQueryData<AppConfig>(['config'])?.configVersion ?? 1
  return useMutation({
    mutationFn: enqueueConfigWrite,
    mutationKey: ['config-write'],
    onMutate: async (data) => {
      queuedWrites += 1
      await qc.cancelQueries({ queryKey: ['config'] })
      const prev = qc.getQueryData<AppConfig>(['config'])
      data.configVersion ??= renderVersion
      qc.setQueryData<AppConfig>(['config'], (old) => {
        if (!old) return old
        const next = { ...old, ...data, configVersion: (old.configVersion ?? 1) + 1 }
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
      for (const key of ctx.keys) {
        const values = failedOptimisticValues.get(key) ?? new Map<unknown, unknown>()
        values.set(ctx.optimistic?.[key], prev[key])
        failedOptimisticValues.set(key, values)
      }
      qc.setQueryData<AppConfig>(['config'], (current) => {
        if (!current) return prev
        const next = { ...current }
        for (const key of ctx.keys) {
          if (!Object.is(current[key], ctx.optimistic?.[key])) continue
          let restored: unknown = prev[key]
          const failed = failedOptimisticValues.get(key)
          const seen = new Set<unknown>()
          while (failed?.has(restored) && !seen.has(restored)) {
            seen.add(restored)
            restored = failed.get(restored)
          }
          next[key] = restored as never
        }
        return next
      })
    },
    onSettled: () => {
      if (queuedWrites === 0) {
        failedOptimisticValues.clear()
        void qc.invalidateQueries({ queryKey: ['config'] })
      }
    },
  })
}
