import { useState } from 'react'
import { Camera, Maximize2 } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { CameraStream } from './CameraStream'
import { cn } from '../../lib/utils'

interface CameraCardProps {
  entityId: string
  label: string
  className?: string
}

export function CameraCard({ entityId, label, className }: CameraCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light } = useHaptic()
  const [sheetOpen, setSheetOpen] = useState(false)

  const isUnavailable = !entity || entity.state === 'unavailable'

  const snapshot = () => {
    light()
    call('camera', 'snapshot', { entity_id: entityId, filename: `/tmp/${entityId.replace('.', '_')}.jpg` })
  }

  if (!entity) {
    return (
      <GlassCard className={cn('flex h-full flex-col items-center justify-center gap-2 min-h-[140px]', className)}>
        <Camera size={28} className="text-black/15" />
        <p className="text-xs text-black/30">Telecamera non configurata</p>
      </GlassCard>
    )
  }

  return (
    <>
      <GlassCard
        noPadding
        interactive={!isUnavailable}
        onClick={() => !isUnavailable && setSheetOpen(true)}
        className={cn('relative h-full min-h-[140px] overflow-hidden', className)}
      >
        {/* Live thumbnail — CameraStream picks WebRTC/MJPEG/snapshot automatically */}
        {!isUnavailable ? (
          <CameraStream entityId={entityId} fit="cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[rgba(20,24,40,0.7)]">
            <Camera size={24} className="text-white/25" />
            <p className="text-xs text-white/35">Immagine non disponibile</p>
            <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-yellow-400">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
              Offline
            </span>
          </div>
        )}

        {/* Top gradient + label + LIVE pill */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
          <p className="text-xs font-medium text-white/90">{label}</p>
          {!isUnavailable && (
            <span className="flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              LIVE
            </span>
          )}
        </div>

        {/* Bottom hint */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
          <Maximize2 size={11} className="text-white/40" />
        </div>
      </GlassCard>

      {/* Fullscreen sheet */}
      <GlassSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={label} side="bottom">
        <div className="flex flex-col gap-4 pb-1">
          <div className="h-[min(62vh,460px)] overflow-hidden rounded-[16px] bg-black/40">
            {!isUnavailable && <CameraStream entityId={entityId} fit="contain" allowTalkback />}
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              onClick={snapshot}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-black/8 py-3 text-sm font-medium text-black/70 transition-all hover:bg-black/12"
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
