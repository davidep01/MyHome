import { ChevronDown, ChevronUp, Home, Minus, Pause, Play, Plus, Square } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type ElementType } from 'react'
import { haApi, type RoomEntity } from '../../api/backend'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useDominantColor } from '../../hooks/useDominantColor'
import { cn } from '../../lib/utils'
import { linkedMediaPlayerEntityId } from '../../lib/mediaEntity'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import {
  WidgetCardControlButton, WidgetCardHoldButton, WidgetCardIcon, WidgetCardIdentity,
  WidgetCardPowerState, WidgetCardShell, WidgetCardSlider, WidgetCardToggle,
} from './WidgetCardBase'
import { CameraStream } from './CameraStream'
import { mapEntityToWidgetCard } from './utils/mapEntityToWidgetCard'
import { numericState } from './utils/formatWidgetValue'
import type { WidgetVisualSize } from './types'
import { HoldDangerAction } from '../controls/HoldDangerAction'
import { isWasteCollectionSensor } from '../../lib/wasteCollection'
import { WasteCollectionCard } from './WasteCollectionCard'
import { mediaArtworkRevision } from '../../lib/mediaArtwork'
import { shouldRenderCameraStream } from './utils/cameraCardStream'
import { MediaCardContent } from './MediaCardContent'

interface Props {
  entity: RoomEntity
  size?: WidgetVisualSize
  className?: string
  isEditing?: boolean
  isDragging?: boolean
}

function serviceDomain(entityId: string) {
  return entityId.split('.')[0]
}

function isOnState(state?: string) {
  return state === 'on' || state === 'open' || state === 'playing' || state === 'cleaning'
}

const TOGGLE_FAMILIES = new Set(['switch', 'smartPlug', 'fan', 'humidifier', 'automation'])
const MEDIA_FAMILIES = new Set(['media', 'speaker', 'tv'])
const COVER_FAMILIES = new Set(['cover', 'curtain', 'gate', 'garage'])

export function WidgetCardFactory({ entity: roomEntity, size = 'M', className, isEditing, isDragging }: Props) {
  const sourceEntity = useHAEntity(roomEntity.entityId)
  const linkedMediaId = linkedMediaPlayerEntityId(roomEntity.entityId, roomEntity.type)
  const linkedMediaEntity = useHAEntity(linkedMediaId ?? roomEntity.entityId)
  const entityId = linkedMediaId && linkedMediaEntity ? linkedMediaId : roomEntity.entityId
  const entity = linkedMediaId && linkedMediaEntity ? linkedMediaEntity : sourceEntity
  const effectiveRoomEntity = useMemo(
    () => entityId === roomEntity.entityId ? roomEntity : { ...roomEntity, entityId },
    [entityId, roomEntity],
  )
  const mapped = useMemo(() => mapEntityToWidgetCard(entity, effectiveRoomEntity), [entity, effectiveRoomEntity])
  const { call } = useHAService()
  const { light, medium, heavy } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null)
  const busyRef = useRef(false)
  const brightnessOriginRef = useRef<{ state: string; brightness?: number } | null>(null)

  const domain = serviceDomain(entityId)
  const unavailable = mapped.isUnavailable
  const on = isOnState(entity?.state)
  const lightPowerCard = mapped.family === 'light' && !unavailable

  const busy = pendingAction !== null

  // ── Card dinamiche: copertina per i media, live feed per le camere ─────────
  const isMediaCard = MEDIA_FAMILIES.has(mapped.family)
  const artworkRevision = isMediaCard ? mediaArtworkRevision(entity?.attributes) : undefined
  const artworkUrl = isMediaCard && mapped.artwork
    ? haApi.imageUrl(mapped.artwork, entityId, artworkRevision)
    : undefined
  const visibleArtworkUrl = failedArtworkUrl === artworkUrl ? undefined : artworkUrl
  const dominant = useDominantColor(artworkUrl)
  const mediaAccent = dominant ?? mapped.accentColor
  // Il live riempie qualsiasi footprint XS/S/M/L/XL; CameraStream sospende da sé
  // le tile fuori viewport o coperte dal full screen.
  const liveCamera = !isEditing && shouldRenderCameraStream(mapped.family, size, unavailable)
  const mediaCoverStyle = isMediaCard && !liveCamera

  /** One in-flight command per card: optimistic start, visible rollback, no double submit. */
  const perform = (
    key: string,
    start: () => void,
    task: () => Promise<unknown>,
    rollback?: () => void,
    finish?: () => void,
  ) => {
    if (busyRef.current) return
    busyRef.current = true
    setPendingAction(key)
    setActionError(null)
    start()
    void Promise.resolve()
      .then(task)
      .catch(() => {
        rollback?.()
        actionFailed()
        setActionError('Comando non eseguito · riprova')
      })
      .finally(() => {
        busyRef.current = false
        setPendingAction(null)
        finish?.()
      })
  }

  const togglePower = () => {
    if (!entity || unavailable) return
    const next = on ? 'off' : 'on'
    perform(
      'power',
      () => { light(); setOptimisticState(entityId, next) },
      () => call(domain, on ? 'turn_off' : 'turn_on', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  const activate = () => {
    if (unavailable) return
    const task = domain === 'scene' || domain === 'script'
      ? () => call(domain, 'turn_on', { entity_id: entityId })
      : domain === 'button' || domain === 'input_button'
        ? () => call(domain, 'press', { entity_id: entityId })
        : domain === 'remote'
          ? () => call('remote', 'toggle', { entity_id: entityId })
          : null
    if (!task) return
    perform('activate', medium, task)
  }

  const adjustClimate = (delta: number) => {
    if (!entity || unavailable) return
    const target = numericState(entity.attributes?.temperature)
    if (target === undefined) return
    const min = numericState(entity.attributes?.min_temp) ?? 7
    const max = numericState(entity.attributes?.max_temp) ?? 35
    const step = numericState(entity.attributes?.target_temp_step) ?? 0.5
    const next = Math.min(max, Math.max(min, Number((target + delta * step).toFixed(1))))
    const serviceDomain = domain === 'water_heater' ? 'water_heater' : 'climate'
    perform(
      'temperature',
      () => { light(); setOptimisticState(entityId, entity.state, { temperature: next }) },
      () => call(serviceDomain, 'set_temperature', { entity_id: entityId, temperature: next }),
      () => setOptimisticState(entityId, entity.state, { temperature: target }),
    )
  }

  const cover = (service: 'open_cover' | 'close_cover' | 'stop_cover') => {
    if (!entity || unavailable) return
    const next = service === 'open_cover' ? 'opening' : service === 'close_cover' ? 'closing' : entity.state
    perform(
      service,
      () => { medium(); if (service !== 'stop_cover') setOptimisticState(entityId, next) },
      () => call('cover', service, { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  const valveAction = (service: 'open_valve' | 'close_valve') => {
    if (!entity || unavailable) return
    const next = service === 'open_valve' ? 'opening' : 'closing'
    perform(
      service,
      () => { medium(); setOptimisticState(entityId, next) },
      () => call('valve', service, { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  const mowerAction = () => {
    if (!entity || unavailable) return
    const mowing = entity?.state === 'mowing'
    perform(
      'mower',
      () => { medium(); setOptimisticState(entityId, mowing ? 'returning' : 'mowing') },
      () => call('lawn_mower', mowing ? 'dock' : 'start_mowing', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  const setTargetHumidity = (value: number) => {
    if (!entity || unavailable) return
    const previous = numericState(entity.attributes?.humidity)
    perform(
      'humidity',
      () => { light(); setOptimisticState(entityId, entity.state, { humidity: Math.round(value) }) },
      () => call('humidifier', 'set_humidity', { entity_id: entityId, humidity: Math.round(value) }),
      () => setOptimisticState(entityId, entity.state, previous === undefined ? {} : { humidity: previous }),
    )
  }

  const setBrightness = (value: number) => {
    if (!entity || busyRef.current) return
    brightnessOriginRef.current ??= {
      state: entity.state,
      brightness: numericState(entity.attributes?.brightness),
    }
    patchEntity(entityId, { attributes: { brightness: Math.round((value / 100) * 255) } })
  }

  const commitBrightness = (value: number) => {
    if (!entity || unavailable) return
    const original = brightnessOriginRef.current ?? {
      state: entity.state,
      brightness: numericState(entity.attributes?.brightness),
    }
    perform(
      'brightness',
      () => { light(); setOptimisticState(entityId, 'on', { brightness: Math.round((value / 100) * 255) }) },
      () => call('light', 'turn_on', { entity_id: entityId, brightness_pct: Math.round(value) }),
      () => setOptimisticState(entityId, original.state, original.brightness === undefined ? {} : { brightness: original.brightness }),
      () => { brightnessOriginRef.current = null },
    )
  }

  const setFanSpeed = (value: number) => {
    if (!entity || unavailable) return
    const previous = numericState(entity.attributes?.percentage)
    perform(
      'fan-speed',
      () => { light(); setOptimisticState(entityId, value > 0 ? 'on' : 'off', { percentage: Math.round(value) }) },
      () => call('fan', 'set_percentage', { entity_id: entityId, percentage: Math.round(value) }),
      () => setOptimisticState(entityId, entity.state, previous === undefined ? {} : { percentage: previous }),
    )
  }

  /** Serratura: sblocco SOLO da hold 900ms (canone); il blocco è un tap. */
  const unlock = () => {
    if (!entity || unavailable) return
    perform(
      'unlock',
      () => { heavy(); setOptimisticState(entityId, 'unlocking') },
      () => call('lock', 'unlock', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity?.state ?? 'locked'),
    )
  }
  const lock = () => {
    if (!entity || unavailable) return
    perform(
      'lock',
      () => { medium(); setOptimisticState(entityId, 'locking') },
      () => call('lock', 'lock', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity?.state ?? 'unlocked'),
    )
  }

  const vacuumAction = () => {
    if (!entity || unavailable) return
    const cleaning = entity.state === 'cleaning'
    perform(
      'vacuum',
      () => { medium(); setOptimisticState(entityId, cleaning ? 'returning' : 'cleaning') },
      () => call('vacuum', cleaning ? 'return_to_base' : 'start', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  const mediaAction = () => {
    if (!entity || unavailable) return
    const playing = entity.state === 'playing'
    perform(
      'media',
      () => { medium(); setOptimisticState(entityId, playing ? 'paused' : 'playing') },
      () => call('media_player', playing ? 'media_pause' : 'media_play', { entity_id: entityId }),
      () => setOptimisticState(entityId, entity.state),
    )
  }

  // ── Controllo in alto a destra, per famiglia ───────────────────────────────
  const trailing = (() => {
    if (unavailable) return null
    if (mapped.family === 'light') {
      return <WidgetCardPowerState active={mapped.isActive} pending={busy} compact={size === 'XS'} />
    }
    if (isEditing) return null
    if (domain === 'siren') {
      return <HoldDangerAction active={on} disabled={busy} onActivate={togglePower} onDeactivate={togglePower} label={mapped.title} compact />
    }
    if (TOGGLE_FAMILIES.has(mapped.family)) {
      return <WidgetCardToggle checked={mapped.isActive} disabled={busy} onToggle={togglePower} color={mapped.accentColor} label={`Accendi o spegni ${mapped.title}`} />
    }
    if (mapped.family === 'scene' || mapped.family === 'script') {
      return <WidgetCardControlButton disabled={busy} onClick={activate} label={`Attiva ${mapped.title}`}><Play size={15} aria-hidden="true" /></WidgetCardControlButton>
    }
    if (size === 'XS' || size === 'S') return null
    if (mapped.family === 'climate' || mapped.family === 'thermostat') {
      return (
        <>
          <WidgetCardControlButton disabled={busy} onClick={() => adjustClimate(-1)} label="Diminuisci temperatura"><Minus size={16} aria-hidden="true" /></WidgetCardControlButton>
          <WidgetCardControlButton disabled={busy} onClick={() => adjustClimate(1)} label="Aumenta temperatura"><Plus size={16} aria-hidden="true" /></WidgetCardControlButton>
        </>
      )
    }
    if (COVER_FAMILIES.has(mapped.family)) {
      const moving = entity?.state === 'opening' || entity?.state === 'closing'
      return (
        <>
          <WidgetCardControlButton disabled={busy} onClick={() => cover('open_cover')} label="Apri"><ChevronUp size={16} aria-hidden="true" /></WidgetCardControlButton>
          {moving
            ? <WidgetCardControlButton disabled={busy} onClick={() => cover('stop_cover')} label="Ferma"><Square size={13} aria-hidden="true" /></WidgetCardControlButton>
            : <WidgetCardControlButton disabled={busy} onClick={() => cover('close_cover')} label="Chiudi"><ChevronDown size={16} aria-hidden="true" /></WidgetCardControlButton>}
        </>
      )
    }
    if (domain === 'valve') {
      return (
        <>
          <WidgetCardControlButton disabled={busy} onClick={() => valveAction('open_valve')} label="Apri valvola"><ChevronUp size={16} aria-hidden="true" /></WidgetCardControlButton>
          <WidgetCardControlButton disabled={busy} onClick={() => valveAction('close_valve')} label="Chiudi valvola"><ChevronDown size={16} aria-hidden="true" /></WidgetCardControlButton>
        </>
      )
    }
    if (mapped.family === 'lock') {
      return <WidgetCardHoldButton locked={entity?.state !== 'unlocked'} disabled={busy} onUnlock={unlock} onLock={lock} accentColor={mapped.accentColor} />
    }
    if (MEDIA_FAMILIES.has(mapped.family)) {
      return (
        <WidgetCardControlButton disabled={busy} onClick={mediaAction} label={entity?.state === 'playing' ? 'Pausa' : 'Riproduci'}>
          {entity?.state === 'playing' ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" className="translate-x-px" />}
        </WidgetCardControlButton>
      )
    }
    if (mapped.family === 'vacuum' || mapped.family === 'mower') {
      const working = entity?.state === 'cleaning' || entity?.state === 'mowing'
      const action = mapped.family === 'mower' ? mowerAction : vacuumAction
      return (
        <WidgetCardControlButton disabled={busy} onClick={action} label={working ? 'Rientra alla base' : 'Avvia'}>
          {working ? <Home size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" className="translate-x-px" />}
        </WidgetCardControlButton>
      )
    }
    return null
  })()

  const showSlider = size !== 'XS' && size !== 'S' && mapped.percent !== undefined && mapped.isActive
    && (mapped.family === 'light' || mapped.family === 'fan' || mapped.family === 'humidifier')

  if (entity && isWasteCollectionSensor(entity)) {
    return (
      <WasteCollectionCard
        entity={entity}
        size={size}
        className={cn(className, feedbackClass)}
        isEditing={isEditing}
        isDragging={isDragging}
        onClick={() => setSelectedEntity(entityId)}
      />
    )
  }

  return (
    <WidgetCardShell
      id={roomEntity.id}
      type={mapped.family}
      size={size}
      title={mapped.title}
      icon={mapped.Icon}
      status={mapped.status}
      accentColor={mapped.accentColor}
      isActive={mapped.isActive}
      isUnavailable={unavailable}
      isPending={busy}
      isEditing={isEditing}
      isDragging={isDragging}
      className={cn(className, feedbackClass, lightPowerCard && 'widget-card-light-power')}
      onClick={lightPowerCard ? togglePower : () => setSelectedEntity(entityId)}
      onClickLabel={lightPowerCard ? `${mapped.isActive ? 'Spegni' : 'Accendi'} ${mapped.title}` : undefined}
      onClickPressed={lightPowerCard ? mapped.isActive : undefined}
      media={liveCamera ? (
          <>
            <CameraStream entityId={entityId} fit="cover" badge className="h-full w-full" />
            {/* Scrim funzionale: il nome resta leggibile su qualunque frame. */}
            <span className="camera-card-scrim absolute inset-x-0 bottom-0 h-16" />
          </>
        ) : mediaCoverStyle ? (
          <ArtworkBackdrop
            url={visibleArtworkUrl}
            title={(entity?.attributes?.media_title as string | undefined) ?? mapped.title}
            Icon={mapped.Icon}
            accentColor={mapped.accentColor}
            appName={(entity?.attributes?.app_name ?? entity?.attributes?.source) as string | undefined}
            playing={entity?.state === 'playing'}
            onError={visibleArtworkUrl ? () => setFailedArtworkUrl(visibleArtworkUrl) : undefined}
          />
        ) : undefined}
    >
      {liveCamera ? (
        <div className="mt-auto min-w-0 pt-2">
          <p className={cn('line-clamp-1 font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]', size === 'XS' ? 'text-[12px]' : 'text-[15px]')}>
            {mapped.title}
          </p>
          {actionError && <p className="mt-0.5 truncate text-[13px] text-red-300">{actionError}</p>}
        </div>
      ) : (
        mediaCoverStyle ? (
          <>
            {trailing && <div className="flex shrink-0 items-center justify-end gap-1.5">{trailing}</div>}
            <MediaCardContent
              entity={entity}
              deviceTitle={mapped.title}
              size={size}
              progress={mapped.mediaProgress}
              accentColor={mediaAccent}
              error={actionError}
            />
          </>
        ) : size === 'XS' ? (
          <div className="flex h-full min-w-0 items-center gap-2">
            <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-tight text-[#1d1d1f] dark:text-white">{mapped.title}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-black/45 dark:text-white/48" style={mapped.stateAccent ? { color: mapped.accentColor } : undefined}>
                {actionError ?? (mapped.value !== undefined ? `${mapped.value}${mapped.unit ?? ''}` : mapped.state)}
              </p>
            </div>
            {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} />
              {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
            </div>

            <WidgetCardIdentity
              title={mapped.title}
              state={actionError ?? (size === 'S' && mapped.value !== undefined ? undefined : mapped.state || undefined)}
              stateColor={actionError ? '#b42318' : mapped.stateAccent ? mapped.accentColor : undefined}
              value={mapped.value}
              unit={mapped.unit}
              size={size}
              active={mapped.isActive}
              singleLineTitle={showSlider && size === 'M'}
            />

            {showSlider && (
              <div className="mt-1.5">
                <WidgetCardSlider
                  value={mapped.percent ?? 0}
                  color={mapped.accentColor}
                  label={`Regola ${mapped.title}`}
                  disabled={busy}
                  onChange={mapped.family === 'light' ? setBrightness : undefined}
                  onCommit={mapped.family === 'light' ? commitBrightness : mapped.family === 'fan' ? setFanSpeed : setTargetHumidity}
                />
              </div>
            )}
          </>
        )
      )}
    </WidgetCardShell>
  )
}

/** Copertina full-bleed: immagine a sinistra, dissolvenza bianca verso i controlli. */
function ArtworkBackdrop({
  url, title, Icon, accentColor, appName, playing, onError,
}: {
  url?: string
  title: string
  Icon: ElementType
  accentColor: string
  appName?: string
  playing: boolean
  onError?: () => void
}) {
  return (
    <div className="media-card-artwork absolute inset-0" data-media-cover-style data-media-cover-source={url ? 'provided' : 'generated'}>
      {url ? (
        <img
          src={url}
          alt={`Copertina: ${title}`}
          className="h-full w-full object-cover object-center"
          onError={onError}
        />
      ) : (
        <div
          className="media-card-generated-cover flex h-full w-full items-center"
          style={{ '--media-cover-accent': accentColor } as CSSProperties}
          aria-label={`Copertina non disponibile: ${title}`}
        >
          <span className="flex w-[50%] flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: accentColor }}>
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-white/85 shadow-sm dark:bg-black/45">
              <Icon size={28} aria-hidden="true" />
            </span>
            <span className="max-w-full truncate text-[11px] font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">{appName ?? 'Media'}</span>
            {playing && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-white">Live</span>}
          </span>
        </div>
      )}
      <span className="media-card-artwork-fade absolute inset-0" />
    </div>
  )
}
