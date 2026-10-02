import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { layoutApi, type TabletDashboardLayout, type TabletLayoutPatch } from '../api/backend'

import { clearTabletLayoutCache, layoutCacheEpoch, readCachedLayout, temporaryLayoutFailure, writeCachedLayout } from '../lib/tabletLayoutCache'
import { ApiError } from '../api/backend'

async function fetchLayoutWithFallback(dashboardId: string): Promise<TabletDashboardLayout> {
  const epoch = layoutCacheEpoch()
  try {
    const layout = await layoutApi.get(dashboardId)
    writeCachedLayout(dashboardId, layout, epoch)
    return layout
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      if (error.status === 401 || error.status === 403) clearTabletLayoutCache()
      throw error
    }
    if (epoch !== layoutCacheEpoch() || !temporaryLayoutFailure(error)) throw error
    const cached = readCachedLayout(dashboardId)
    if (cached) return cached
    throw error
  }
}

export function useTabletLayout(dashboardId = 'home') {
  return useQuery({
    queryKey: ['tablet-layout', dashboardId],
    queryFn: () => fetchLayoutWithFallback(dashboardId),
    staleTime: 2000,
    refetchInterval: 6000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useSaveTabletLayout(dashboardId = 'home') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: TabletLayoutPatch) => layoutApi.update(dashboardId, patch),
    onSuccess: (layout) => {
      writeCachedLayout(dashboardId, layout)
      qc.setQueryData(['tablet-layout', dashboardId], layout)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tablet-layout', dashboardId] }),
  })
}
