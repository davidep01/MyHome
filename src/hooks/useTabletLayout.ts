import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { layoutApi, type TabletDashboardLayout, type TabletLayoutPatch } from '../api/backend'

const CACHE_PREFIX = 'myhome.kiosk.layout.'

function cacheKey(dashboardId: string) {
  return `${CACHE_PREFIX}${dashboardId}`
}

function readCachedLayout(dashboardId: string): TabletDashboardLayout | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cacheKey(dashboardId))
    if (!raw) return null
    return { ...JSON.parse(raw), source: 'cache' } as TabletDashboardLayout
  } catch {
    return null
  }
}

function writeCachedLayout(dashboardId: string, layout: TabletDashboardLayout) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(cacheKey(dashboardId), JSON.stringify(layout))
  } catch {
    // Cache is best-effort only; backend remains the source of truth.
  }
}

async function fetchLayoutWithFallback(dashboardId: string): Promise<TabletDashboardLayout> {
  try {
    const layout = await layoutApi.get(dashboardId)
    writeCachedLayout(dashboardId, layout)
    return layout
  } catch (error) {
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
