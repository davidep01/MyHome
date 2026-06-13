import { ChevronDown, ChevronUp, Home, Minus, Pause, Play, Plus, Shield, Square } from 'lucide-react'
import { useMemo } from 'react'
import type { RoomEntity } from '../../api/backend'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { cn } from '../../lib/utils'
import { useEntityStore } from '../../store/entities'
import {
  WidgetCardControlButton, WidgetCardHoldButton, WidgetCardIcon, WidgetCardIdentity,
  WidgetCardShell, WidgetCardSlider, WidgetCardToggle,
} from './WidgetCardBase'
import { mapEntityToWidgetCard } from './utils/mapEntityToWidgetCard'
import { numericState } from './utils/formatWidgetValue'
import type { WidgetVisualSize } from './types'

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

  const domain = serviceDomain(roomEntity.entityId)
  const unavailable = mapped.isUnavailable
  const on = isOnState(entity?.state)

  /** Ogni azione HA fallita deve vedersi: rollback (se c'è) + shake/haptic. */
  const act = (action: Promise<unknown>, rollback?: () => void) =>
    action.catch(() => { rollback?.(); actionFailed() })

  const togglePower = () => {
    if (!entity || unavailable) return
    light()
    const next = on ? 'off' : 'on'
    setOptimisticState(roomEntity.entityId, next)
    act(
      call(domain, on ? 'turn_off' : 'turn_on', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity.state),
    )
  }

  const activate = () => {
    if (unavailable) return
    medium()
    if (domain === 'scene' || domain === 'script') act(call(domain, 'turn_on', { entity_id: roomEntity.entityId }))
    else if (domain === 'button' || domain === 'input_button') act(call(domain, 'press', { entity_id: roomEntity.entityId }))
    else if (domain === 'remote') act(call('remote', 'toggle', { entity_id: roomEntity.entityId }))
  }

  const adjustClimate = (delta: number) => {
    if (!entity || unavailable) return
    const target = numericState(entity.attributes?.temperature)
    if (target === undefined) return
    const min = numericState(entity.attributes?.min_temp) ?? 7
    const max = numericState(entity.attributes?.max_temp) ?? 35
    const step = numericState(entity.attributes?.target_temp_step) ?? 0.5
    const next = Math.min(max, Math.max(min, Number((target + delta * step).toFixed(1))))
    light()
    setOptimisticState(roomEntity.entityId, entity.state, { temperature: next })
    act(
      call('climate', 'set_temperature', { entity_id: roomEntity.entityId, temperature: next }),
      () => setOptimisticState(roomEntity.entityId, entity.state, { temperature: target }),
    )
  }

  const cover = (service: 'open_cover' | 'close_cover' | 'stop_cover') => {
    if (unavailable) return
    medium()
    act(call('cover', service, { entity_id: roomEntity.entityId }))
  }

  const valveAction = (service: 'open_valve' | 'close_valve') => {
    if (unavailable) return
    medium()
    act(call('valve', service, { entity_id: roomEntity.entityId }))
  }

  const mowerAction = () => {
    if (unavailable) return
    medium()
    const mowing = entity?.state === 'mowing'
    act(call('lawn_mower', mowing ? 'dock' : 'start_mowing', { entity_id: roomEntity.entityId }))
  }

  const setTargetHumidity = (value: number) => {
    setOptimisticState(roomEntity.entityId, 'on', { humidity: Math.round(value) })
    act(call('humidifier', 'set_humidity', { entity_id: roomEntity.entityId, humidity: Math.round(value) }))
  }

  const setBrightness = (value: number) => {
    patchEntity(roomEntity.entityId, { attributes: { brightness: Math.round((value / 100) * 255) } })
  }

  const commitBrightness = (value: number) => {
    setOptimisticState(roomEntity.entityId, 'on', { brightness: Math.round((value / 100) * 255) })
    act(call('light', 'turn_on', { entity_id: roomEntity.entityId, brightness_pct: Math.round(value) }))
  }

  const setFanSpeed = (value: number) => {
    setOptimisticState(roomEntity.entityId, value > 0 ? 'on' : 'off', { percentage: Math.round(value) })
    act(call('fan', 'set_percentage', { entity_id: roomEntity.entityId, percentage: Math.round(value) }))
  }

  /** Serratura: sblocco SOLO da hold 900ms (canone); il blocco è un tap. */
  const unlock = () => {
    heavy()
    setOptimisticState(roomEntity.entityId, 'unlocking')
    act(
      call('lock', 'unlock', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity?.state ?? 'locked'),
    )
  }
  const lock = () => {
    medium()
    setOptimisticState(roomEntity.entityId, 'locking')
    act(
      call('lock', 'lock', { entity_id: roomEntity.entityId }),
      () => setOptimisticState(roomEntity.entityId, entity?.state ?? 'unlocked'),
    )
  }

  const alarmAction = () => {
    if (unavailable) return
    heavy()
    const state = entity?.state
    act(call('alarm_control_panel', state === 'disarmed' ? 'alarm_arm_home' : 'alarm_disarm', { entity_id: roomEntity.entityId }))
  }

  const vacuumAction = () => {
    if (unavailable) return
    medium()
    act(call('vacuum', entity?.state === 'cleaning' ? 'return_to_base' : 'start', { entity_id: roomEntity.entityId }))
  }

  const mediaAction = () => {
    if (unavailable) return
    medium()
    act(call('media_player', entity?.state === 'playing' ? 'media_pause' : 'media_play', { entity_id: roomEntity.entityId }))
  }

  // ── Controllo in alto a destra, per famiglia ───────────────────────────────
  const trailing = (() => {
    if (unavailable || isEditing) return null
    if (TOGGLE_FAMILIES.has(mapped.family)) {
      return <WidgetCardToggle checked={mapped.isActive} onToggle={togglePower} color={mapped.accentColor} label={`Accendi o spegni ${mapped.title}`} />
    }
    if (size === 'S') return null
    if (mapped.family === 'climate' || mapped.family === 'thermostat') {
      return (
        <>
          <WidgetCardControlButton onClick={() => adjustClimate(-1)} label="Diminuisci temperatura"><Minus size={16} /></WidgetCardControlButton>
          <WidgetCardControlButton onClick={() => adjustClimate(1)} label="Aumenta temperatura"><Plus size={16} /></WidgetCardControlButton>
        </>
      )
    }
    if (COVER_FAMILIES.has(mapped.family)) {
      const moving = entity?.state === 'opening' || entity?.state === 'closing'
      return (
        <>
          <WidgetCardControlButton onClick={() => cover('open_cover')} label="Apri"><ChevronUp size={16} /></WidgetCardControlButton>
          {moving
            ? <WidgetCardControlButton onClick={() => cover('stop_cover')} label="Ferma"><Square size={13} /></WidgetCardControlButton>
            : <WidgetCardControlButton onClick={() => cover('close_cover')} label="Chiudi"><ChevronDown size={16} /></WidgetCardControlButton>}
        </>
      )
    }
    if (domain === 'valve') {
      return (
        <>
          <WidgetCardControlButton onClick={() => valveAction('open_valve')} label="Apri valvola"><ChevronUp size={16} /></WidgetCardControlButton>
          <WidgetCardControlButton onClick={() => valveAction('close_valve')} label="Chiudi valvola"><ChevronDown size={16} /></WidgetCardControlButton>
        </>
      )
    }
    if (mapped.family === 'lock') {
      return <WidgetCardHoldButton locked={entity?.state !== 'unlocked'} onUnlock={unlock} onLock={lock} accentColor={mapped.accentColor} />
    }
    if (MEDIA_FAMILIES.has(mapped.family)) {
      return (
        <WidgetCardControlButton onClick={mediaAction} label={entity?.state === 'playing' ? 'Pausa' : 'Riproduci'}>
          {entity?.state === 'playing' ? <Pause size={15} /> : <Play size={15} className="translate-x-px" />}
        </WidgetCardControlButton>
      )
    }
    if (mapped.family === 'vacuum' || mapped.family === 'mower') {
      const working = entity?.state === 'cleaning' || entity?.state === 'mowing'
      const action = mapped.family === 'mower' ? mowerAction : vacuumAction
      return (
        <WidgetCardControlButton onClick={action} label={working ? 'Rientra alla base' : 'Avvia'}>
          {working ? <Home size={15} /> : <Play size={15} className="translate-x-px" />}
        </WidgetCardControlButton>
      )
    }
    if (mapped.family === 'alarm') {
      return <WidgetCardControlButton onClick={alarmAction} label="Cambia stato sicurezza"><Shield size={15} /></WidgetCardControlButton>
    }
    return null
  })()

  // ── Tap sulla card = azione primaria (mai per le serrature) ───────────────
  const primaryClick =
    mapped.family === 'lock' ? undefined
    : TOGGLE_FAMILIES.has(mapped.family) && mapped.family !== 'automation' ? togglePower
    : mapped.family === 'scene' || mapped.family === 'script' ? activate
    : mapped.family === 'vacuum' ? vacuumAction
    : mapped.family === 'mower' ? mowerAction
    : MEDIA_FAMILIES.has(mapped.family) ? mediaAction
    : undefined

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
      isEditing={isEditing}
      isDragging={isDragging}
      className={cn(className, feedbackClass)}
      onClick={primaryClick}
    >
      <div className="flex items-start justify-between gap-2">
        <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} />
        {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
      </div>

      <WidgetCardIdentity
        title={mapped.title}
        state={size === 'S' && mapped.value !== undefined ? undefined : mapped.state || undefined}
        stateColor={mapped.stateAccent ? mapped.accentColor : undefined}
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
            onChange={mapped.family === 'light' ? setBrightness : undefined}
            onCommit={mapped.family === 'light' ? commitBrightness : mapped.family === 'fan' ? setFanSpeed : setTargetHumidity}
          />
        </div>
      )}
    </WidgetCardShell>
  )
}
