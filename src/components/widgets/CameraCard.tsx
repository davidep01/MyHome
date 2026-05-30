import { useState, useEffect, useCallback } from 'react'
import { Camera, RefreshCw, Maximize2, Clock } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { getCameraProxyUrl, getCameraStreamUrl } from '../../api/ha-rest'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

const REFRESH_INTERVAL = 30_000

interface CameraCardProps {
  entityId: string
  label: string
  className?: string
}

function timeAgoSecs(secs: number): string {
  if (secs < 60) return `${secs}s fa`
  return `${Math.floor(secs / 60)}m fa`
}

function cacheBust(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`
}

export function CameraCard({ entityId, label, className }: CameraCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()

  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<number>(0)
  const [elapsed, setElapsed] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [liveFailed, setLiveFailed] = useState(false)

  const isUnavailable = !entity || entity.state === 'unavailable'

  const refresh = useCallback(() => {
    setLoading(true)
    // Cache-bust the snapshot URL so the browser fetches a fresh frame
    setSnapshotUrl(cacheBust(getCameraProxyUrl(entityId)))
    setLastRefresh(Date.now())
    setElapsed(0)
  }, [entityId])

  // Initial load + interval
  useEffect(() => {
    if (isUnavailable) return
    const first = setTimeout(refresh, 0)
    const id = setInterval(refresh, REFRESH_INTERVAL)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [isUnavailable, refresh])

  // Elapsed counter
  useEffect(() => {
    if (!lastRefresh) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastRefresh) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [lastRefresh])

  const forceSnapshot = () => {
    light()
    call('camera', 'snapshot', { entity_id: entityId, filename: `/tmp/${entityId.replace('.', '_')}.jpg` })
    setTimeout(refresh, 1000)
  }

  if (!entity) {
    return (
      <GlassCard className={cn('flex flex-col items-center justify-center gap-2 min-h-[140px]', className)}>
        <Camera size={28} className="text-white/15" />
        <p className="text-xs text-white/30">Telecamera non configurata</p>
        <p className="text-[10px] text-white/20">Aggiungi <code className="font-mono">camera.*</code> in rooms.ts</p>
      </GlassCard>
    )
  }

  return (
    <>
      <GlassCard
        noPadding
        interactive={!isUnavailable}
        onClick={() => !isUnavailable && (setLiveFailed(false), setSheetOpen(true))}
        className={cn('overflow-hidden min-h-[140px] relative', className)}
      >
        {/* Snapshot image */}
        {snapshotUrl && !isUnavailable && (
          <img
            src={snapshotUrl}
            alt={label}
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/5">
            <RefreshCw size={20} className="text-white/20 animate-spin" />
          </div>
        )}

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(20,24,40,0.7)]">
            <Camera size={24} className="text-white/25" />
            <p className="text-xs text-white/35">Immagine non disponibile</p>
            <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
              Offline
            </span>
          </div>
        )}

        {/* Top gradient overlay with label */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white/90">{label}</p>
            <button
              onClick={(e) => { e.stopPropagation(); refresh() }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-black/30 text-white/50 hover:text-white transition-colors"
            >
              <RefreshCw size={10} />
            </button>
          </div>
        </div>

        {/* Bottom info bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
          <Clock size={9} style={{ color: tokens.text.tertiary }} />
          <span className="text-[10px]" style={{ color: tokens.text.tertiary }}>
            {timeAgoSecs(elapsed)}
          </span>
          <Maximize2 size={9} className="ml-auto text-white/30" />
        </div>
      </GlassCard>

      {/* Fullscreen sheet */}
      <GlassSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={label}
        side="bottom"
        className="h-[80vh]"
      >
        <div className="flex flex-col gap-4 h-full">
          {/* Live MJPEG stream via the backend HA proxy, falling back to snapshots. */}
          <div className="flex-1 rounded-[16px] overflow-hidden bg-black/40">
            {!isUnavailable && !liveFailed ? (
              <img
                src={getCameraStreamUrl(entityId)}
                alt={label}
                className="h-full w-full object-contain"
                onError={() => setLiveFailed(true)}
              />
            ) : snapshotUrl ? (
              <img src={snapshotUrl} alt={label} className="h-full w-full object-contain" />
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex gap-3 shrink-0">
            <button
              onClick={refresh}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-white/8 py-3 text-sm font-medium text-white/70 hover:bg-white/12 transition-all"
            >
              <RefreshCw size={14} />
              Aggiorna
            </button>
            <button
              onClick={forceSnapshot}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-white/8 py-3 text-sm font-medium text-white/70 hover:bg-white/12 transition-all"
            >
              <Camera size={14} />
              Cattura
            </button>
          </div>
        </div>
      </GlassSheet>
    </>
  )
}
