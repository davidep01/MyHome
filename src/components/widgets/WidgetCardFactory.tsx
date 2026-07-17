import { ChevronDown, ChevronUp, Home, Minus, Pause, Play, Plus, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ElementType } from 'react'
import { haApi, type RoomEntity } from '../../api/backend'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useDominantColor } from '../../hooks/useDominantColor'
import { cn } from '../../lib/utils'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import {
  WidgetCardControlButton, WidgetCardHoldButton, WidgetCardIcon, WidgetCardIdentity,
  WidgetCardShell, WidgetCardSlider, WidgetCardToggle,
} from './WidgetCardBase'
import { CameraStream } from './CameraStream'
import { mapEntityToWidgetCard } from './utils/mapEntityToWidgetCard'
import { numericState } from './utils/formatWidgetValue'
import { mediaProgressPct } from './utils/mediaProgress'
import type { WidgetVisualSize } from './types'
import { HoldDangerAction } from '../controls/HoldDangerAction'

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

const TOGGLE_FAMILIES = new Set(['light', 'switch', 'smartPlug', 'fan', 'humidifier', 'automation'])
const MEDIA_FAMILIES = new Set(['media', 'speaker', 'tv'])
const COVER_FAMILIES = new Set(['cover', 'curtain', 'gate', 'garage'])

export function WidgetCardFactory({ entity: roomEntity, size = 'M', className, isEditing, isDragging }: Props) {
  const entity = useHAEntity(roomEntity.entityId)
  const mapped = useMemo(() => mapEntityToWidgetCard(entity, roomEntity), [entity, roomEntity])
  const { call } = useHAService()
  const { light, medium, heavy } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const setSelectedEntity = useUIStore((s) => s.setSelectedEntity)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const brightnessOriginRef = useRef<{ state: string; brightness?: number } | null>(null)

  const domain = serviceDomain(roomEntity.entityId)
  const unavailable = mapped.isUnavailable
  const on = isOnState(entity?.state)

  const busy = pendingAction !== null

  // ── Card dinamiche: copertina per i media, live feed per le camere ─────────
  const isMediaCard = MEDIA_FAMILIES.has(mapped.family)
  const artworkUrl = isMediaCard && mapped.artwork
    ? haApi.imageUrl(mapped.artwork, roomEntity.entityId)
    : undefined
  const dominant = useDominantColor(artworkUrl)
  const mediaAccent = dominant ?? mapped.accentColor
  // Il live nel corpo card ha senso da M in su: su S resta l'icona animata.
  const liveCamera = (mapped.family === 'camera' || mapped.family === 'doorbell')
    && size !== 'S' && !unavailable

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
      () => { light(); setOptimisticState(roomEntity.entityId, next) },
      () => call(domain, on ? 'turn_off' : 'turn_on', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const activate = () => {
    if (unavailable) return
    const task = domain === 'scene' || domain === 'script'
      ? () => call(domain, 'turn_on', { entity_id: roomEntity.entityId })
      : domain === 'button' || domain === 'input_button'
        ? () => call(domain, 'press', { entity_id: roomEntity.entityId })
        : domain === 'remote'
          ? () => call('remote', 'toggle', { entity_id: roomEntity.entityId })
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
      () => { light(); setOptimisticState(roomEntity.entityId, entity.state, { temperature: next }) },
      () => call(serviceDomain, 'set_temperature', { entity_id: roomEntity.entityId, temperature: next }),
      () => setOptimisticState(roomEntity.entityId, entity.state, { temperature: target }),
    )
  }

  const cover = (service: 'open_cover' | 'close_cover' | 'stop_cover') => {
    if (!entity || unavailable) return
    const next = service === 'open_cover' ? 'opening' : service === 'close_cover' ? 'closing' : entity.state
    perform(
      service,
      () => { medium(); if (service !== 'stop_cover') setOptimisticState(roomEntity.entityId, next) },
      () => call('cover', service, { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const valveAction = (service: 'open_valve' | 'close_valve') => {
    if (!entity || unavailable) return
    const next = service === 'open_valve' ? 'opening' : 'closing'
    perform(
      service,
      () => { medium(); setOptimisticState(roomEntity.entityId, next) },
      () => call('valve', service, { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const mowerAction = () => {
    if (!entity || unavailable) return
    const mowing = entity?.state === 'mowing'
    perform(
      'mower',
      () => { medium(); setOptimisticState(roomEntity.entityId, mowing ? 'returning' : 'mowing') },
      () => call('lawn_mower', mowing ? 'dock' : 'start_mowing', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const setTargetHumidity = (value: number) => {
    if (!entity || unavailable) return
    const previous = numericState(entity.attributes?.humidity)
    perform(
      'humidity',
      () => { light(); setOptimisticState(roomEntity.entityId, entity.state, { humidity: Math.round(value) }) },
      () => call('humidifier', 'set_humidity', { entity_id: roomEntity.entityId, humidity: Math.round(value) }),
      () => setOptimisticState(roomEntity.entityId, entity.state, previous === undefined ? {} : { humidity: previous }),
    )
  }

  const setBrightness = (value: number) => {
    if (!entity || busyRef.current) return
    brightnessOriginRef.current ??= {
      state: entity.state,
      brightness: numericState(entity.attributes?.brightness),
    }
    patchEntity(roomEntity.entityId, { attributes: { brightness: Math.round((value / 100) * 255) } })
  }

  const commitBrightness = (value: number) => {
    if (!entity || unavailable) return
    const original = brightnessOriginRef.current ?? {
      state: entity.state,
      brightness: numericState(entity.attributes?.brightness),
    }
    perform(
      'brightness',
      () => { light(); setOptimisticState(roomEntity.entityId, 'on', { brightness: Math.round((value / 100) * 255) }) },
      () => call('light', 'turn_on', { entity_id: roomEntity.entityId, brightness_pct: Math.round(value) }),
      () => setOptimisticState(roomEntity.entityId, original.state, original.brightness === undefined ? {} : { brightness: original.brightness }),
      () => { brightnessOriginRef.current = null },
    )
  }

  const setFanSpeed = (value: number) => {
    if (!entity || unavailable) return
    const previous = numericState(entity.attributes?.percentage)
    perform(
      'fan-speed',
      () => { light(); setOptimisticState(roomEntity.entityId, value > 0 ? 'on' : 'off', { percentage: Math.round(value) }) },
      () => call('fan', 'set_percentage', { entity_id: roomEntity.entityId, percentage: Math.round(value) }),
      () => setOptimisticState(roomEntity.entityId, entity.state, previous === undefined ? {} : { percentage: previous }),
    )
  }

  /** Serratura: sblocco SOLO da hold 900ms (canone); il blocco è un tap. */
  const unlock = () => {
    if (!entity || unavailable) return
    perform(
      'unlock',
      () => { heavy(); setOptimisticState(roomEntity.entityId, 'unlocking') },
      () => call('lock', 'unlock', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity?.state ?? 'locked'),
    )
  }
  const lock = () => {
    if (!entity || unavailable) return
    perform(
      'lock',
      () => { medium(); setOptimisticState(roomEntity.entityId, 'locking') },
      () => call('lock', 'lock', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity?.state ?? 'unlocked'),
    )
  }

  const vacuumAction = () => {
    if (!entity || unavailable) return
    const cleaning = entity.state === 'cleaning'
    perform(
      'vacuum',
      () => { medium(); setOptimisticState(roomEntity.entityId, cleaning ? 'returning' : 'cleaning') },
      () => call('vacuum', cleaning ? 'return_to_base' : 'start', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const mediaAction = () => {
    if (!entity || unavailable) return
    const playing = entity.state === 'playing'
    perform(
      'media',
      () => { medium(); setOptimisticState(roomEntity.entityId, playing ? 'paused' : 'playing') },
      () => call('media_player', playing ? 'media_pause' : 'media_play', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  // ── Controllo in alto a destra, per famiglia ───────────────────────────────
  const trailing = (() => {
    if (unavailable || isEditing) return null
    if (domain === 'siren') {
      return <HoldDangerAction active={on} disabled={busy} onActivate={togglePower} onDeactivate={togglePower} label={mapped.title} compact />
    }
    if (TOGGLE_FAMILIES.has(mapped.family)) {
      return <WidgetCardToggle checked={mapped.isActive} disabled={busy} onToggle={togglePower} color={mapped.accentColor} label={`Accendi o spegni ${mapped.title}`} />
    }
    if (mapped.family === 'scene' || mapped.family === 'script') {
      return <WidgetCardControlButton disabled={busy} onClick={activate} label={`Attiva ${mapped.title}`}><Play size={15} aria-hidden="true" /></WidgetCardControlButton>
    }
    if (size === 'S') return null
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

  const showSlider = size !== 'S' && mapped.percent !== undefined && mapped.isActive
    && (mapped.family === 'light' || mapped.family === 'fan' || mapped.family === 'humidifier')

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
      className={cn(className, feedbackClass)}
      onClick={() => setSelectedEntity(roomEntity.entityId)}
      media={liveCamera ? (
        <>
          <CameraStream entityId={roomEntity.entityId} fit="cover" badge className="h-full w-full" />
          {/* Scrim funzionale: il nome resta leggibile su qualunque frame. */}
          <span className="camera-card-scrim absolute inset-x-0 bottom-0 h-16" />
        </>
      ) : undefined}
    >
      {liveCamera ? (
        <div className="mt-auto min-w-0 pt-2">
          <p className="line-clamp-1 text-[15px] font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
            {mapped.title}
          </p>
          {actionError && <p className="mt-0.5 truncate text-[13px] text-red-300">{actionError}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            {artworkUrl
              ? <ArtworkThumb url={artworkUrl} size={size} Icon={mapped.Icon} accentColor={mediaAccent} active={mapped.isActive} title={mapped.title} />
              : <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} />}
            {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
          </div>

          <WidgetCardIdentity
            title={mapped.title}
            state={actionError ?? (size === 'S' && mapped.value !== undefined ? undefined : mapped.state || undefined)}
            stateColor={actionError ? '#b42318'
              : mapped.stateAccent ? mapped.accentColor
              : isMediaCard && mapped.isActive && dominant ? dominant
              : undefined}
            value={mapped.value}
            unit={mapped.unit}
            size={size}
            active={mapped.isActive}
            singleLineTitle={showSlider && size === 'M'}
          />

          {size !== 'S' && mapped.mediaProgress && (
            <MediaProgressBar progress={mapped.mediaProgress} color={mediaAccent} />
          )}

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
      )}
    </WidgetCardShell>
  )
}

/**
 * Copertina al posto del puck icona (§9.4): quadrata, raggio interno, si
 * degrada all'icona animata se l'immagine non arriva. Il colore dominante
 * della copertina diventa l'accent della card mentre suona.
 */
function ArtworkThumb({
  url, size, Icon, accentColor, active, title,
}: {
  url: string
  size: WidgetVisualSize
  Icon: ElementType
  accentColor: string
  active: boolean
  title: string
}) {
  // Il fallimento è per-URL: una copertina nuova riprova da sola, senza effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (failedUrl === url) return <WidgetCardIcon Icon={Icon} size={size} accentColor={accentColor} active={active} />
  const box = size === 'S' ? 34 : size === 'M' ? 44 : 52
  return (
    <img
      src={url}
      alt={`Copertina: ${title}`}
      width={box}
      height={box}
      className="widget-card-artwork shrink-0 rounded-[11px] object-cover"
      style={{ width: box, height: box }}
      onError={() => setFailedUrl(url)}
    />
  )
}

/** Barra sottile del progresso di riproduzione: scaleX-only, tick 1s. */
function MediaProgressBar({
  progress, color,
}: {
  progress: NonNullable<ReturnType<typeof mapEntityToWidgetCard>['mediaProgress']>
  color: string
}) {
  // La percentuale si deriva in render; l'intervallo fa solo avanzare il tempo.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!progress.playing) return
    const id = setInterval(() => tick((n) => n + 1), 1_000)
    return () => clearInterval(id)
  }, [progress.playing])
  const pct = mediaProgressPct(progress)
  return (
    <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-black/10" aria-hidden="true">
      <span
        className="block h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear"
        style={{ transform: `scaleX(${pct / 100})`, background: color }}
      />
    </div>
  )
}
