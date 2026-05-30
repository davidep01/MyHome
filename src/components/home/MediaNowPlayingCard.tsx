import { Music2, Pause, Play } from 'lucide-react'
import { GlassCard } from '../glass/GlassCard'
import { useEntityStore } from '../../store/entities'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { haApi } from '../../api/backend'
import { tokens } from '../../design/tokens'

export function MediaNowPlayingCard() {
  const entity = useEntityStore((s) => Object.values(s.entities).find((item) => item.entity_id.startsWith('media_player.') && item.state === 'playing'))
  const { call } = useHAService()
  const { light } = useHaptic()

  if (!entity) return null

  const title = (entity.attributes?.media_title as string | undefined) ?? (entity.attributes?.friendly_name as string | undefined) ?? 'In riproduzione'
  const artist = (entity.attributes?.media_artist ?? entity.attributes?.app_name) as string | undefined
  const pictureRelative = entity.attributes?.entity_picture as string | undefined
  const pictureUrl = pictureRelative ? haApi.mediaUrl(pictureRelative) : undefined

  const toggle = () => {
    light()
    call('media_player', 'media_play_pause', { entity_id: entity.entity_id })
  }

  return (
    <GlassCard noPadding className="relative col-span-1 min-h-[184px] overflow-hidden lg:col-span-1 xl:col-span-1">
      {pictureUrl && (
        <div className="absolute inset-0">
          <img src={pictureUrl} alt="" className="h-full w-full object-cover opacity-30" style={{ filter: 'blur(20px) scale(1.18)' }} />
          <div className="absolute inset-0 bg-black/55" />
        </div>
      )}
      <div className="relative flex h-full flex-col p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10">
          <Music2 size={18} style={{ color: tokens.accent.green }} />
        </div>
        <div className="mt-auto min-w-0">
          <p className="truncate text-sm font-semibold text-white/90">{title}</p>
          {artist && <p className="mt-1 truncate text-xs text-white/45">{artist}</p>}
          <button
            type="button"
            onClick={toggle}
            className="mt-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/14 text-white transition active:scale-95"
          >
            {entity.state === 'playing' ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>
      </div>
    </GlassCard>
  )
}
