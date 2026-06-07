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
    const es = new EventSource('/api/config/stream?client=desktop')
    es.addEventListener('config', () => {
      qc.invalidateQueries({ queryKey: ['config'] })
    })
    // Errors are transient — the browser reconnects automatically; stay quiet.
    es.onerror = () => {}
    return () => es.close()
  }, [qc])
}
