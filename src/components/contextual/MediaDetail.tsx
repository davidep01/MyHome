import { useMemo, useState } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  SkipBack, SkipForward, Play, Pause, Square, Volume2, VolumeX,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CornerUpLeft, Home as HomeIcon, Menu as MenuIcon, Power,
} from 'lucide-react'
import { DragSlider } from '../glass/DragSlider'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { haApi } from '../../api/backend'
import { cn } from '../../lib/utils'

/** Full media controls + (for Apple TV / pyatv) a directional remote pad. */
export function MediaDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const entities = useEntityStore((s) => s.entities)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const [volPreview, setVolPreview] = useState<number | null>(null)

  const entityId = entity.entity_id
  const attrs = entity.attributes ?? {}
  const state = entity.state
  const isPlaying = state === 'playing'
  const isOff = state === 'off' || state === 'standby' || state === 'unavailable'

  const title = attrs.media_title as string | undefined
  const artist = (attrs.media_artist ?? attrs.app_name) as string | undefined
  const pic = attrs.entity_picture ? haApi.mediaUrl(attrs.entity_picture as string) : undefined
  const volume = (attrs.volume_level as number | undefined) ?? 0.5
  const muted = Boolean(attrs.is_volume_muted)
  const sources = (attrs.source_list as string[] | undefined) ?? []
  const currentSource = attrs.source as string | undefined

  // Apple TV exposes a matching remote.<object_id> for navigation.
  const remoteId = `remote.${entityId.split('.')[1]}`
  const hasRemote = Boolean(entities[remoteId]) && entities[remoteId]?.state !== 'unavailable'

  const mp = (service: string, data?: Record<string, unknown>) => {
    light()
    call('media_player', service, { entity_id: entityId, ...data })
  }
  const cmd = (command: string) => {
    medium()
    call('remote', 'send_command', { entity_id: remoteId, command })
  }
  const setVolume = (level: number) => {
    setOptimisticState(entityId, state, { volume_level: level })
    call('media_player', 'volume_set', { entity_id: entityId, volume_level: level })
  }

  const dpad = useMemo(() => ([
    { c: 'up', Icon: ChevronUp, area: 'up' },
    { c: 'left', Icon: ChevronLeft, area: 'left' },
    { c: 'select', Icon: null, area: 'mid' },
    { c: 'right', Icon: ChevronRight, area: 'right' },
    { c: 'down', Icon: ChevronDown, area: 'down' },
  ] as const), [])

  return (
    <div className="flex flex-col gap-5">
      {/* Now playing */}
      <div className="flex items-center gap-3">
        {pic ? (
          <img src={pic} alt="" className="h-16 w-16 shrink-0 rounded-[14px] object-cover shadow-md" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-black/8">
            <Play size={22} className="text-black/30" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#1d1d1f]">{title ?? (isOff ? 'Spento' : 'Nessuna riproduzione')}</p>
          {artist && <p className="truncate text-sm text-black/50">{artist}</p>}
        </div>
        <button onClick={() => mp(isOff ? 'turn_on' : 'turn_off')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 active:scale-90" aria-label="Accendi/Spegni">
          <Power size={17} />
        </button>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-3">
        <Round onClick={() => mp('media_previous_track')}><SkipBack size={20} /></Round>
        <button onClick={() => mp('media_play_pause')} className="flex h-14 w-14 items-center justify-center rounded-full bg-black/15 text-[#1d1d1f] active:scale-90">
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <Round onClick={() => mp('media_next_track')}><SkipForward size={20} /></Round>
        <Round onClick={() => mp('media_stop')}><Square size={16} /></Round>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3">
        <button onClick={() => mp('volume_mute', { is_volume_muted: !muted })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 active:scale-90" aria-label="Muto">
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <div className="flex-1">
          <DragSlider
            value={volPreview ?? Math.round(volume * 100)}
            onChange={(v) => setVolPreview(Math.round(v))}
            onChangeEnd={(v) => { setVolPreview(null); setVolume(v / 100) }}
            variant="blue"
          />
        </div>
      </div>

      {/* Remote D-pad (Apple TV / pyatv) */}
      {hasRemote && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Telecomando</p>
          <div className="mx-auto grid w-[210px] grid-cols-3 grid-rows-3 gap-1.5"
            style={{ gridTemplateAreas: '". up ." "left mid right" ". down ."' }}>
            {dpad.map(({ c, Icon, area }) => (
              <button
                key={c}
                onClick={() => cmd(c)}
                style={{ gridArea: area }}
                className={cn(
                  'flex items-center justify-center rounded-[16px] active:scale-90 transition',
                  area === 'mid' ? 'h-16 bg-[#0066cc] text-white text-sm font-semibold' : 'h-16 bg-black/8 text-black/70 hover:bg-black/12',
                )}
                aria-label={c}
              >
                {Icon ? <Icon size={24} /> : 'OK'}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <RemoteBtn onClick={() => cmd('menu')} Icon={CornerUpLeft} label="Indietro" />
            <RemoteBtn onClick={() => cmd('home')} Icon={HomeIcon} label="Home" />
            <RemoteBtn onClick={() => cmd('top_menu')} Icon={MenuIcon} label="Menu" />
          </div>
        </div>
      )}

      {/* App / source picker */}
      {sources.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">App</p>
          <div className="grid grid-cols-3 gap-2">
            {sources.slice(0, 12).map((src) => (
              <button
                key={src}
                onClick={() => mp('select_source', { source: src })}
                className={cn(
                  'truncate rounded-[12px] px-2 py-2.5 text-xs font-medium transition',
                  currentSource === src ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/65 hover:bg-black/12',
                )}
              >
                {src}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Round({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/60 hover:bg-black/12 active:scale-90 transition">
      {children}
    </button>
  )
}

function RemoteBtn({ onClick, Icon, label }: { onClick: () => void; Icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-[14px] bg-black/8 py-2.5 text-[11px] font-medium text-black/65 hover:bg-black/12 active:scale-90 transition">
      <Icon size={18} />
      {label}
    </button>
  )
}
