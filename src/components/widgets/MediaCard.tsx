import { useState, useEffect } from 'react'
import { Music2, SkipBack, Play, Pause, SkipForward, Volume2, Radio } from 'lucide-react'
import { DragSlider } from '../glass/DragSlider'
import { motion } from 'framer-motion'
import { GlassCard } from '../glass/GlassCard'
import { GlassSheet } from '../glass/GlassSheet'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useLongPress } from '../../hooks/useLongPress'
import { haApi } from '../../api/backend'
import { tokens } from '../../design/tokens'
import { cn } from '../../lib/utils'

interface MediaCardProps {
  entityId: string
  label: string
  className?: string
}

function ProgressBar({ position, duration }: { position: number; duration: number }) {
  const pct = duration > 0 ? Math.min((position / duration) * 100, 100) : 0
  return (
    <div className="h-0.5 w-full rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full bg-white/50"
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1, ease: 'linear' }}
      />
    </div>
  )
}

export function MediaCard({ entityId, label, className }: MediaCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const [volumeSheet, setVolumeSheet] = useState(false)
  const [now, setNow] = useState(0)

  const state = entity?.state
  const attrs = entity?.attributes ?? {}
  const isPlaying = state === 'playing'
  const isIdle = state === 'idle' || state === 'standby'
  const isUnavailable = !entity || state === 'unavailable'
  const isUnconfigured = !entity

  const title = attrs.media_title as string | undefined
  const artist = (attrs.media_artist ?? attrs.app_name) as string | undefined
  const pictureRelative = attrs.entity_picture as string | undefined
  const pictureUrl = pictureRelative ? haApi.mediaUrl(pictureRelative) : undefined
  const volume = (attrs.volume_level as number | undefined) ?? 0.5
  const duration = (attrs.media_duration as number | undefined) ?? 0
  const positionUpdatedAt = attrs.media_position_updated_at as string | undefined
  const basePosition = (attrs.media_position as number | undefined) ?? 0
  const baseTime = positionUpdatedAt ? new Date(positionUpdatedAt).getTime() : 0
  const livePosition = isPlaying && baseTime && now
    ? basePosition + ((now - baseTime) / 1000)
    : basePosition

  // Sync live playback position
  useEffect(() => {
    if (!isPlaying) return
    const first = setTimeout(() => setNow(Date.now()), 0)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [isPlaying, positionUpdatedAt])

  const openVolumeSheet = () => { medium(); setVolumeSheet(true) }
  const longPress = useLongPress(openVolumeSheet)

  const playPause = () => { light(); call('media_player', 'media_play_pause', { entity_id: entityId }) }
  const prev = () => { light(); call('media_player', 'media_previous_track', { entity_id: entityId }) }
  const next = () => { light(); call('media_player', 'media_next_track', { entity_id: entityId }) }
  const turnOn = () => { light(); call('media_player', 'turn_on', { entity_id: entityId }) }
  const setVolume = (v: number) => call('media_player', 'volume_set', { entity_id: entityId, volume_level: v })

  // ── Unconfigured / unavailable state ─────────────────────────────────────
  if (isUnconfigured) {
    return (
      <GlassCard className={cn('flex flex-col items-center justify-center gap-2 min-h-[140px] text-center', className)}>
        <Music2 size={28} className="text-white/15" />
        <p className="text-xs font-medium text-white/30">Media Player</p>
        <p className="text-[10px] text-white/20 max-w-[140px] leading-tight">
          Aggiungi <code className="font-mono text-white/30">media_player.*</code> in rooms.ts
        </p>
      </GlassCard>
    )
  }

  // ── Idle / standby ────────────────────────────────────────────────────────
  if (isIdle || isUnavailable) {
    return (
      <GlassCard
        interactive={!isUnavailable}
        onClick={!isUnavailable ? turnOn : undefined}
        className={cn('flex items-center gap-3 min-h-[80px]', className)}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/8">
          <Music2 size={18} className="text-white/25" />
        </div>
        <div>
          <p className="text-sm font-medium text-white/90">{label}</p>
          <p className="text-xs mt-0.5" style={{ color: tokens.text.tertiary }}>
            {isUnavailable ? 'Non disponibile' : 'Nessuna riproduzione'}
          </p>
        </div>
        {!isUnavailable && (
          <button className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/50">
            <Play size={14} />
          </button>
        )}
      </GlassCard>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  return (
    <>
      <GlassCard
        noPadding
        className={cn('overflow-hidden min-h-[160px] relative', className)}
        {...longPress}
      >
        {/* Blurred album art as card background */}
        {pictureUrl && (
          <div className="absolute inset-0">
            <img src={pictureUrl} alt="" className="h-full w-full object-cover opacity-20" style={{ filter: 'blur(20px) scale(1.2)' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          </div>
        )}

        <div className="relative flex flex-col gap-3 p-4 h-full">
          {/* Album art + track info */}
          <div className="flex items-center gap-3">
            {pictureUrl ? (
              <img src={pictureUrl} alt={title} className="h-12 w-12 shrink-0 rounded-[12px] object-cover shadow-lg" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-white/10">
                <Radio size={20} className="text-white/40" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{title ?? label}</p>
              {artist && <p className="text-xs mt-0.5 truncate" style={{ color: tokens.text.secondary }}>{artist}</p>}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Volume2 size={12} className="text-white/40" />
              <span className="text-xs text-white/40">{Math.round(volume * 100)}%</span>
            </div>
          </div>

          {/* Progress */}
          {duration > 0 && <ProgressBar position={livePosition} duration={duration} />}

          {/* Controls — min 44×44px per touch target HIG */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={prev}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/8 transition-all active:scale-90"
            >
              <SkipBack size={20} />
            </button>
            <button
              onClick={playPause}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 hover:bg-white/22 transition-all active:scale-90"
            >
              {isPlaying ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white" />}
            </button>
            <button
              onClick={next}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/8 transition-all active:scale-90"
            >
              <SkipForward size={20} />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Volume sheet */}
      <GlassSheet open={volumeSheet} onClose={() => setVolumeSheet(false)} title="Volume">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Volume2 size={18} className="text-white/50" />
            <span className="text-lg font-semibold text-white">{Math.round(volume * 100)}%</span>
          </div>
          <DragSlider
            value={Math.round(volume * 100)}
            onChange={(v) => setVolume(v / 100)}
            onChangeEnd={(v) => setVolume(v / 100)}
            color="rgba(255,255,255,0.8)"
          />
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setVolume(pct / 100)}
                className={cn(
                  'rounded-[12px] py-2 text-sm font-medium transition-all',
                  Math.round(volume * 100) === pct
                    ? 'bg-white/20 text-white'
                    : 'bg-white/8 text-white/60 hover:bg-white/12',
                )}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </GlassSheet>
    </>
  )
}
