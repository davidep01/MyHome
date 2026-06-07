import { ChevronDown, ChevronUp, Home, Pause, Play, Power, Square, X } from 'lucide-react'
import { useMemo } from 'react'
import { haApi, type RoomEntity } from '../../api/backend'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useEntityStore } from '../../store/entities'
import { WidgetCardBadge, WidgetCardDial, WidgetCardFooter, WidgetCardHeader, WidgetCardIcon, WidgetCardRing, WidgetCardShell, WidgetCardSlider, WidgetCardToggle, WidgetCardValue, WidgetIconButton } from './WidgetCardBase'
import { mapEntityToWidgetCard } from './utils/mapEntityToWidgetCard'
import { numericState, pct } from './utils/formatWidgetValue'
import { getWidgetSizeConfig } from './utils/getWidgetSizeConfig'
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

export function WidgetCardFactory({ entity: roomEntity, size = 'M', className, isEditing, isDragging }: Props) {
  const entity = useHAEntity(roomEntity.entityId)
  const mapped = useMemo(() => mapEntityToWidgetCard(entity, roomEntity), [entity, roomEntity])
  const { call } = useHAService()
  const { light, medium, heavy } = useHaptic()
  const setOptimisticState = useEntityStore((s) => s.setOptimisticState)
  const patchEntity = useEntityStore((s) => s.patchEntity)
  const cfg = getWidgetSizeConfig(size)

  const domain = serviceDomain(roomEntity.entityId)
  const unavailable = mapped.isUnavailable
  const on = isOnState(entity?.state)

  const togglePower = () => {
    if (!entity || unavailable) return
    light()
    const next = on ? 'off' : 'on'
    setOptimisticState(roomEntity.entityId, next)
    call(domain, on ? 'turn_off' : 'turn_on', { entity_id: roomEntity.entityId }).catch(() => {
      setOptimisticState(roomEntity.entityId, entity.state)
    })
  }

  const activate = () => {
    if (unavailable) return
    medium()
    if (domain === 'scene' || domain === 'script') call(domain, 'turn_on', { entity_id: roomEntity.entityId })
    else if (domain === 'button' || domain === 'input_button') call(domain, 'press', { entity_id: roomEntity.entityId })
    else if (domain === 'remote') call('remote', 'toggle', { entity_id: roomEntity.entityId })
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
    call('climate', 'set_temperature', { entity_id: roomEntity.entityId, temperature: next })
  }

  const climatePower = () => {
    if (!entity || unavailable) return
    medium()
    const next = entity.state === 'off' ? 'auto' : 'off'
    setOptimisticState(roomEntity.entityId, next)
    call('climate', 'set_hvac_mode', { entity_id: roomEntity.entityId, hvac_mode: next })
  }

  const cover = (service: 'open_cover' | 'close_cover' | 'stop_cover') => {
    if (unavailable) return
    medium()
    call('cover', service, { entity_id: roomEntity.entityId })
  }

  const setBrightness = (value: number) => {
    patchEntity(roomEntity.entityId, { attributes: { brightness: Math.round((value / 100) * 255) } })
  }

  const commitBrightness = (value: number) => {
    setOptimisticState(roomEntity.entityId, 'on', { brightness: Math.round((value / 100) * 255) })
    call('light', 'turn_on', { entity_id: roomEntity.entityId, brightness_pct: Math.round(value) })
  }

  const setFanSpeed = (value: number) => {
    setOptimisticState(roomEntity.entityId, value > 0 ? 'on' : 'off', { percentage: Math.round(value) })
    call('fan', 'set_percentage', { entity_id: roomEntity.entityId, percentage: Math.round(value) })
  }

  const lockAction = () => {
    if (unavailable) return
    heavy()
    const unlocked = entity?.state === 'unlocked'
    call('lock', unlocked ? 'lock' : 'unlock', { entity_id: roomEntity.entityId })
  }

  const alarmAction = () => {
    if (unavailable) return
    heavy()
    const state = entity?.state
    call('alarm_control_panel', state === 'disarmed' ? 'alarm_arm_home' : 'alarm_disarm', { entity_id: roomEntity.entityId })
  }

  const vacuumAction = () => {
    if (unavailable) return
    medium()
    call('vacuum', entity?.state === 'cleaning' ? 'return_to_base' : 'start', { entity_id: roomEntity.entityId })
  }

  const mediaAction = () => {
    if (unavailable) return
    medium()
    call('media_player', entity?.state === 'playing' ? 'media_pause' : 'media_play', { entity_id: roomEntity.entityId })
  }

  const renderCore = () => {
    const currentTemp = numericState(entity?.attributes?.current_temperature)
    const targetTemp = numericState(entity?.attributes?.temperature)
    const brightness = mapped.family === 'light' ? pct(mapped.ringValue) : undefined
    const volume = mapped.family === 'media' || mapped.family === 'speaker' || mapped.family === 'tv'
      ? Math.round(Number(entity?.attributes?.volume_level ?? 0) * 100)
      : undefined
    const position = mapped.family === 'cover' || mapped.family === 'curtain' || mapped.family === 'gate' || mapped.family === 'garage'
      ? pct(mapped.ringValue)
      : undefined

    if (size === 'S') {
      return (
        <>
          <div className="flex items-start justify-between gap-2">
            <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} animationPreset={mapped.isActive ? mapped.animationPreset : 'none'} />
            {mapped.status === 'warning' || mapped.status === 'critical' || mapped.status === 'triggered' || unavailable
              ? <WidgetCardBadge tone={mapped.status === 'critical' || mapped.status === 'triggered' ? 'critical' : 'warning'}>{unavailable ? 'N/D' : '!'}</WidgetCardBadge>
              : null}
          </div>
          <div className="mt-auto min-w-0">
            <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">{mapped.title}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-black/45">{mapped.unit ? `${mapped.primary}${mapped.unit}` : mapped.primary}</p>
          </div>
        </>
      )
    }

    const showDial = mapped.family === 'climate' || mapped.family === 'thermostat'
    const showRing = !showDial && mapped.ringValue !== undefined

    return (
      <>
        <WidgetCardHeader
          title={mapped.title}
          subtitle={mapped.subtitle}
          Icon={mapped.Icon}
          accentColor={mapped.accentColor}
          size={size}
          trailing={
            mapped.family === 'light' || mapped.family === 'switch' || mapped.family === 'smartPlug' || mapped.family === 'fan'
              ? <WidgetCardToggle checked={mapped.isActive} disabled={unavailable} onToggle={mapped.family === 'fan' ? togglePower : togglePower} color={mapped.accentColor} label={`Toggle ${mapped.title}`} />
              : <WidgetCardBadge tone={mapped.isUnavailable ? 'neutral' : mapped.status === 'triggered' || mapped.status === 'critical' ? 'critical' : mapped.status === 'warning' ? 'warning' : mapped.isActive ? 'ok' : 'neutral'}>{mapped.subtitle}</WidgetCardBadge>
          }
        />

        <div className="mt-3 flex min-h-0 flex-1 items-center gap-3">
          {showDial ? (
            <WidgetCardDial
              value={targetTemp ?? currentTemp ?? 0}
              current={currentTemp}
              min={7}
              max={35}
              size={size}
              color={mapped.accentColor}
            >
              <span className={cfg.valueClass + ' font-semibold leading-none tabular-nums'}>
                {targetTemp?.toFixed(1) ?? '--'}
              </span>
              <span className="text-[10px] font-bold text-black/40">target</span>
            </WidgetCardDial>
          ) : showRing ? (
            <WidgetCardRing value={Math.min(mapped.ringValue ?? 0, mapped.ringMax ?? 100)} max={mapped.ringMax ?? 100} size={size} color={mapped.accentColor} label={mapped.unit}>
              {mapped.family === 'camera' && !unavailable ? (
                <img
                  src={haApi.cameraProxyUrl(roomEntity.entityId)}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <>
                  <span className="text-base font-bold leading-none tabular-nums text-[#1d1d1f]">{mapped.primary}</span>
                  {mapped.unit && <span className="text-[10px] font-bold text-black/40">{mapped.unit}</span>}
                </>
              )}
            </WidgetCardRing>
          ) : (
            <WidgetCardIcon Icon={mapped.Icon} size={size} accentColor={mapped.accentColor} active={mapped.isActive} animationPreset={mapped.animationPreset} />
          )}

          <div className="min-w-0 flex-1">
            <WidgetCardValue
              value={mapped.primary}
              unit={mapped.unit}
              secondary={mapped.secondary}
              size={size}
              accentColor={mapped.accentColor}
            />
            {size === 'L' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[12px] bg-black/[0.045] px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-black/35">Stato</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-black/65">{mapped.subtitle}</p>
                </div>
                <div className="rounded-[12px] bg-black/[0.045] px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-black/35">Origine</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-black/65">{mapped.family}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {mapped.family === 'light' && brightness !== undefined && mapped.isActive && (
          <div className="mt-3">
            <WidgetCardSlider value={brightness} color={mapped.accentColor} onChange={setBrightness} onCommit={commitBrightness} />
          </div>
        )}

        {mapped.family === 'fan' && (
          <div className="mt-3">
            <WidgetCardSlider value={pct(mapped.ringValue)} color={mapped.accentColor} onCommit={setFanSpeed} />
          </div>
        )}

        <WidgetCardFooter>
          {mapped.family === 'climate' || mapped.family === 'thermostat' ? (
            <div className="flex items-center gap-2">
              <WidgetIconButton onClick={() => adjustClimate(-1)} label="Diminuisci temperatura" disabled={unavailable}><ChevronDown size={18} /></WidgetIconButton>
              <WidgetIconButton onClick={() => adjustClimate(1)} label="Aumenta temperatura" disabled={unavailable}><ChevronUp size={18} /></WidgetIconButton>
              <WidgetIconButton onClick={climatePower} label="Accendi o spegni clima" disabled={unavailable}><Power size={18} /></WidgetIconButton>
            </div>
          ) : position !== undefined ? (
            <div className="flex items-center gap-2">
              <WidgetIconButton onClick={() => cover('open_cover')} label="Apri" disabled={unavailable}><ChevronUp size={18} /></WidgetIconButton>
              <WidgetIconButton onClick={() => cover('stop_cover')} label="Stop" disabled={unavailable}><Square size={16} /></WidgetIconButton>
              <WidgetIconButton onClick={() => cover('close_cover')} label="Chiudi" disabled={unavailable}><ChevronDown size={18} /></WidgetIconButton>
            </div>
          ) : mapped.family === 'lock' ? (
            <WidgetIconButton onClick={lockAction} label={entity?.state === 'unlocked' ? 'Blocca' : 'Sblocca'} disabled={unavailable}><Home size={18} /></WidgetIconButton>
          ) : mapped.family === 'alarm' ? (
            <WidgetIconButton onClick={alarmAction} label="Cambia stato sicurezza" disabled={unavailable}><Power size={18} /></WidgetIconButton>
          ) : mapped.family === 'vacuum' ? (
            <WidgetIconButton onClick={vacuumAction} label={entity?.state === 'cleaning' ? 'Rientra alla base' : 'Avvia pulizia'} disabled={unavailable}>{entity?.state === 'cleaning' ? <Home size={18} /> : <Play size={18} />}</WidgetIconButton>
          ) : mapped.family === 'media' || mapped.family === 'speaker' || mapped.family === 'tv' ? (
            <div className="flex items-center gap-2">
              <WidgetIconButton onClick={mediaAction} label="Play pausa" disabled={unavailable}>{entity?.state === 'playing' ? <Pause size={18} /> : <Play size={18} />}</WidgetIconButton>
              {volume !== undefined && <span className="rounded-full bg-black/[0.06] px-3 py-2 text-xs font-bold text-black/45">{volume}%</span>}
            </div>
          ) : mapped.family === 'scene' || mapped.family === 'script' || mapped.family === 'automation' ? (
            <WidgetIconButton onClick={mapped.family === 'automation' ? togglePower : activate} label="Esegui" disabled={unavailable}>{mapped.family === 'automation' && mapped.isActive ? <X size={18} /> : <Play size={18} />}</WidgetIconButton>
          ) : mapped.family === 'switch' || mapped.family === 'smartPlug' ? (
            <WidgetIconButton onClick={togglePower} label="Toggle" disabled={unavailable}><Power size={18} /></WidgetIconButton>
          ) : null}

          {size === 'L' && entity?.last_updated && (
            <span className="ml-auto truncate text-[11px] font-medium text-black/35">
              {new Date(entity.last_updated).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </WidgetCardFooter>
      </>
    )
  }

  const primaryClick =
    mapped.family === 'light' || mapped.family === 'switch' || mapped.family === 'smartPlug' || mapped.family === 'fan'
      ? togglePower
      : mapped.family === 'scene' || mapped.family === 'script'
        ? activate
        : mapped.family === 'lock'
          ? lockAction
          : mapped.family === 'vacuum'
            ? vacuumAction
            : mapped.family === 'media' || mapped.family === 'speaker' || mapped.family === 'tv'
              ? mediaAction
              : undefined

  return (
    <WidgetCardShell
      id={roomEntity.id}
      type={mapped.family}
      size={size}
      title={mapped.title}
      icon={mapped.Icon}
      status={mapped.status}
      accentColor={mapped.accentColor}
      gradient={mapped.gradient}
      animationPreset={mapped.animationPreset}
      isActive={mapped.isActive}
      isUnavailable={mapped.isUnavailable}
      isEditing={isEditing}
      isDragging={isDragging}
      className={className}
      onClick={primaryClick}
    >
      {renderCore()}
    </WidgetCardShell>
  )
}
