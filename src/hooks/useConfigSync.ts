import { invalidateClientRegistry } from '../api/ha-registry'
import { clearTabletLayoutCache, syncLayoutCacheGeneration } from '../lib/tabletLayoutCache'
import { useEntityStore } from '../store/entities'
import { isConfigWritePending } from './useDashboardConfig'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Subscribes to the backend SSE config stream and refetches the (global) config
 * whenever it changes on any device — so an edit on the desktop updates the
 * tablet and every other client live. EventSource auto-reconnects on drops
 * (e.g. after an add-on restart). Silent no-op if SSE isn't available.
 */
export function useConfigSync() {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/config/stream')
    let generation: string | null = null
    const refresh = (event: Event) => {
      try {
        const incoming = (JSON.parse((event as MessageEvent).data) as { haGeneration?: string }).haGeneration
        if (incoming && incoming !== generation) {
          useEntityStore.getState().setSourceGeneration(incoming)
          if (useEntityStore.getState().sourceGeneration !== incoming) return
          const previous = generation
          generation = incoming
          syncLayoutCacheGeneration(incoming)
          invalidateClientRegistry()
          if (previous) clearTabletLayoutCache()
          for (const key of ['ha-area-index', 'ha-entity-registry-dashboard-curation', 'ha-entity-registry-platforms', 'ha-registry-platforms', 'ha-history', 'energy-baseline', 'water-flow-history', 'screensaver-ai-recap']) {
            void qc.cancelQueries({ queryKey: [key] }).then(() => qc.resetQueries({ queryKey: [key] }))
          }
        }
      } catch { /* compatible with older servers' ready payload */ }
      for (const key of ['config', 'tablet-layout', 'weather', 'news', 'calendar-events', 'screensaver-photos']) {
        if (key === 'config' && isConfigWritePending()) continue
        void qc.invalidateQueries({ queryKey: [key] })
      }
    }
    es.addEventListener('config', refresh)
    // Changes missed while disconnected are not replayed by this stream.
    es.addEventListener('ready', refresh)
    // Errors are transient — the browser reconnects automatically; stay quiet.
    es.onerror = () => {}
    return () => es.close()
  }, [qc])
}
