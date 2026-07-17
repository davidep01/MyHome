import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { HassEntity } from 'home-assistant-js-websocket'
import {
  SkipBack, SkipForward, Play, Pause, Square, Volume2, VolumeX,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CornerUpLeft,
  Home as HomeIcon, LoaderCircle, Menu as MenuIcon, Power,
} from 'lucide-react'
import { DragSlider } from '../glass/DragSlider'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useEntityStore } from '../../store/entities'
import { haApi } from '../../api/backend'
import { cn } from '../../lib/utils'
import { resolveMediaArtwork } from '../../lib/mediaArtwork'

/** Full media controls + (for Apple TV / pyatv) a directional remote pad. */
export function MediaDetail({ entity }: { entity: HassEntity }) {
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const entities = useEntityStore((s) => s.entities)
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const [volPreview, setVolPreview] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  const entityId = entity.entity_id
  const attrs = entity.attributes ?? {}
  const state = entity.state
  const isPlaying = state === 'playing'
  const unavailable = state === 'unavailable'
  const isOff = state === 'off' || state === 'standby'
  const busy = pendingAction !== null

  const title = attrs.media_title as string | undefined
  const artist = (attrs.media_artist ?? attrs.app_name) as string | undefined
  const picturePath = resolveMediaArtwork(attrs)
  const pic = picturePath ? haApi.imageUrl(picturePath, entity.entity_id) : undefined
  const volume = (attrs.volume_level as number | undefined) ?? 0.5
  const muted = Boolean(attrs.is_volume_muted)
  const sources = (attrs.source_list as string[] | undefined) ?? []
  const currentSource = attrs.source as string | undefined

  // Apple TV exposes a matching remote.<object_id> for navigation.
  const remoteId = `remote.${entityId.split('.')[1]}`
  const hasRemote = Boolean(entities[remoteId]) && entities[remoteId]?.state !== 'unavailable'

  const run = (
    key: string,
    task: () => Promise<unknown>,
    optimistic?: () => void,
    rollback?: () => void,
    haptic: () => void = light,
    allowWhenMediaUnavailable = false,
  ) => {
    if (busyRef.current || (unavailable && !allowWhenMediaUnavailable)) return
    busyRef.current = true
    setPendingAction(key)
    setError(null)
    haptic()
    optimistic?.()
    void Promise.resolve()
      .then(task)
      .catch(() => {
        rollback?.()
        actionFailed()
        setError('Comando multimediale non eseguito. Riprova.')
      })
      .finally(() => {
        busyRef.current = false
        setPendingAction(null)
      })
  }

  const mediaAction = (
    key: string,
    service: string,
    data?: Record<string, unknown>,
    optimistic?: () => void,
    rollback?: () => void,
  ) => run(key, () => call('media_player', service, { entity_id: entityId, ...data }), optimistic, rollback)

  const remoteCommand = (command: string) => run(
    `remote-${command}`,
    () => call('remote', 'send_command', { entity_id: remoteId, command }),
    undefined,
    undefined,
    medium,
    true,
  )

  const setVolume = (level: number) => {
    const next = Math.max(0, Math.min(1, level))
    mediaAction(
      'volume',
      'volume_set',
      { volume_level: next },
      () => setOptimisticState(entityId, state, { volume_level: next }),
      () => setOptimisticState(entityId, state, { volume_level: volume }),
    )
  }

  const dpad = useMemo(() => ([
    { command: 'up', label: 'Su', Icon: ChevronUp, area: 'up' },
    { command: 'left', label: 'Sinistra', Icon: ChevronLeft, area: 'left' },
    { command: 'select', label: 'OK', Icon: null, area: 'mid' },
    { command: 'right', label: 'Destra', Icon: ChevronRight, area: 'right' },
    { command: 'down', label: 'Giù', Icon: ChevronDown, area: 'down' },
  ] as const), [])

  return (
    <div className={cn('flex flex-col gap-5', feedbackClass)} aria-busy={busy}>
      {/* Now playing */}
      <div className="flex items-center gap-3">
        {pic ? (
          <img src={pic} alt="" className="h-16 w-16 shrink-0 rounded-[14px] object-cover shadow-md" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-black/8" aria-hidden="true">
            <Play size={22} className="text-black/30" />
          </div>
        )}
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="truncate text-base font-semibold text-[#1d1d1f]">{title ?? (isOff ? 'Spento' : 'Nessuna riproduzione')}</p>
          {artist && <p className="truncate text-sm text-black/50">{artist}</p>}
        </div>
        <button
          type="button"
          onClick={() => mediaAction(
            'power',
            isOff ? 'turn_on' : 'turn_off',
            undefined,
            () => setOptimisticState(entityId, isOff ? 'idle' : 'off'),
            () => setOptimisticState(entityId, state),
          )}
          disabled={busy || unavailable}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isOff ? 'Accendi' : 'Spegni'}
        >
          {pendingAction === 'power' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Power size={17} aria-hidden="true" />}
        </button>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-3" role="group" aria-label="Controlli riproduzione">
        <Round label="Traccia precedente" disabled={busy || unavailable || isOff} onClick={() => mediaAction('previous', 'media_previous_track')}><SkipBack size={20} aria-hidden="true" /></Round>
        <button
          type="button"
          onClick={() => mediaAction(
            'play-pause',
            'media_play_pause',
            undefined,
            () => setOptimisticState(entityId, isPlaying ? 'paused' : 'playing'),
            () => setOptimisticState(entityId, state),
          )}
          disabled={busy || unavailable || isOff}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-black/15 text-[#1d1d1f] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
        >
          {pendingAction === 'play-pause'
            ? <LoaderCircle size={24} className="animate-spin" aria-hidden="true" />
            : isPlaying ? <Pause size={24} aria-hidden="true" /> : <Play size={24} aria-hidden="true" />}
        </button>
        <Round label="Traccia successiva" disabled={busy || unavailable || isOff} onClick={() => mediaAction('next', 'media_next_track')}><SkipForward size={20} aria-hidden="true" /></Round>
        <Round
          label="Ferma"
          disabled={busy || unavailable || isOff}
          onClick={() => mediaAction(
            'stop',
            'media_stop',
            undefined,
            () => setOptimisticState(entityId, 'idle'),
            () => setOptimisticState(entityId, state),
          )}
        >
          <Square size={16} aria-hidden="true" />
        </Round>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => mediaAction(
            'mute',
            'volume_mute',
            { is_volume_muted: !muted },
            () => setOptimisticState(entityId, state, { is_volume_muted: !muted }),
            () => setOptimisticState(entityId, state, { is_volume_muted: muted }),
          )}
          disabled={busy || unavailable || isOff}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/8 text-black/55 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={muted ? 'Riattiva audio' : 'Disattiva audio'}
          aria-pressed={muted}
        >
          {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
        </button>
        <div className="flex-1">
          <DragSlider
            value={volPreview ?? Math.round(volume * 100)}
            onChange={(value) => setVolPreview(Math.round(value))}
            onChangeEnd={(value) => { setVolPreview(null); setVolume(value / 100) }}
            variant="blue"
            ariaLabel="Volume"
            disabled={busy || unavailable || isOff}
          />
        </div>
      </div>

      {/* Remote D-pad (Apple TV / pyatv) */}
      {hasRemote && (
        <div>
          <p id="media-remote-label" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">Telecomando</p>
          <div
            className="mx-auto grid w-[210px] grid-cols-3 grid-rows-3 gap-1.5"
            style={{ gridTemplateAreas: '". up ." "left mid right" ". down ."' }}
            role="group"
            aria-labelledby="media-remote-label"
          >
            {dpad.map(({ command, label, Icon, area }) => (
              <button
                type="button"
                key={command}
                onClick={() => remoteCommand(command)}
                disabled={busy}
                style={{ gridArea: area }}
                className={cn(
                  'flex h-16 items-center justify-center rounded-[16px] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40',
                  area === 'mid' ? 'bg-[#0066cc] text-sm font-semibold text-white' : 'bg-black/8 text-black/70 hover:bg-black/12',
                )}
                aria-label={label}
              >
                {Icon ? <Icon size={24} aria-hidden="true" /> : 'OK'}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <RemoteBtn disabled={busy} onClick={() => remoteCommand('menu')} Icon={CornerUpLeft} label="Indietro" />
            <RemoteBtn disabled={busy} onClick={() => remoteCommand('home')} Icon={HomeIcon} label="Home" />
            <RemoteBtn disabled={busy} onClick={() => remoteCommand('top_menu')} Icon={MenuIcon} label="Menu" />
          </div>
        </div>
      )}

      {/* App / source picker */}
      {sources.length > 0 && (
        <div>
          <p id="media-source-label" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/35">App</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="media-source-label">
            {sources.slice(0, 12).map((source) => (
              <button
                type="button"
                key={source}
                onClick={() => mediaAction(
                  `source-${source}`,
                  'select_source',
                  { source },
                  () => setOptimisticState(entityId, state, { source }),
                  () => setOptimisticState(entityId, state, { source: currentSource }),
                )}
                disabled={busy || unavailable || isOff}
                aria-pressed={currentSource === source}
                className={cn(
                  'min-h-11 truncate rounded-[12px] px-2 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  currentSource === source ? 'bg-[#0066cc] text-white' : 'bg-black/8 text-black/65 hover:bg-black/12',
                )}
              >
                {source}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[12px] bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

function Round({ onClick, children, label, disabled }: { onClick: () => void; children: ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-black/8 text-black/60 transition hover:bg-black/12 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function RemoteBtn({ onClick, Icon, label, disabled }: { onClick: () => void; Icon: React.ElementType; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 flex-col items-center gap-1 rounded-[14px] bg-black/8 py-2.5 text-[11px] font-semibold text-black/65 transition hover:bg-black/12 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </button>
  )
}
