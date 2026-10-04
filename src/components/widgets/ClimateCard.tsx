import { performEntityAction } from '../../lib/entityActions'
import type { ElementType, MouseEvent as ReactMouseEvent } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Droplets, Fan, Flame, Minus, Plus, Power, Snowflake, Sparkles, Thermometer, Wind } from 'lucide-react'
import { useHAEntity } from '../../hooks/useHAEntity'
import { useHAService } from '../../hooks/useHAService'
import { useHaptic } from '../../hooks/useHaptic'
import { useActionFeedback } from '../../hooks/useActionFeedback'
import { useEntityStore } from '../../store/entities'
import { useUIStore } from '../../store/ui'
import {
  formatClimateTemp,
  getClimateControls,
  snapClimateTemperature,
  getClimateModes,
  getClimateOptionLabel,
  getClimateVisualState,
  getHvacModeLabel,
  pickOnHvacMode,
} from '../../lib/climate'
import { numericState } from './utils/formatWidgetValue'
import { cn } from '../../lib/utils'
import type { WidgetCardStatus, WidgetVisualSize } from './types'
import { WidgetCardControlButton, WidgetCardIcon, WidgetCardShell } from './WidgetCardBase'
import { temperatureTone, widgetTones, type RingTone } from './utils/getRingColorScale'

interface ClimateCardProps {
  entityId: string
  cardId?: string
  label: string
  size?: WidgetVisualSize
  className?: string
  isEditing?: boolean
  isDragging?: boolean
  iconOverride?: ElementType
}

const MODE_ICONS: Record<string, ElementType> = {
  off: Power,
  heat: Flame,
  cool: Snowflake,
  auto: Sparkles,
  heat_cool: Sparkles,
  dry: Droplets,
  fan_only: Fan,
}

const QUICK_MODE_ORDER = ['heat_cool', 'auto', 'cool', 'heat', 'dry', 'fan_only']

function numberAttr(value: unknown): number | undefined {
  return numericState(value)
}

function listAttr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function climateTone(tone: ReturnType<typeof getClimateVisualState>['tone']): RingTone {
  if (tone === 'heating') return widgetTones.heat
  if (tone === 'cooling') return widgetTones.cool
  if (tone === 'drying') return widgetTones.water
  if (tone === 'fan') return widgetTones.ok
  return widgetTones.neutral
}

function climateStatus(tone: ReturnType<typeof getClimateVisualState>['tone']): WidgetCardStatus {
  if (tone === 'heating') return 'heating'
  if (tone === 'cooling') return 'cooling'
  if (tone === 'drying') return 'dry'
  if (tone === 'fan') return 'fan'
  if (tone === 'off') return 'off'
  if (tone === 'unavailable') return 'unavailable'
  return 'idle'
}

function modeIconKey(visual: ReturnType<typeof getClimateVisualState>): string {
  if (visual.activeAction === 'heating') return 'heat'
  if (visual.activeAction === 'cooling') return 'cool'
  if (visual.activeAction === 'drying') return 'dry'
  if (visual.activeAction === 'fan') return 'fan_only'
  return visual.mode
}

/** Card clima canonica: un'unica sorgente live, cinque layout realmente adattivi. */
export function ClimateCard({
  entityId,
  cardId,
  label,
  size = 'M',
  className,
  isEditing = false,
  isDragging = false,
  iconOverride,
}: ClimateCardProps) {
  const entity = useHAEntity(entityId)
  const { call } = useHAService()
  const { light, medium } = useHaptic()
  const { feedbackClass, actionFailed } = useActionFeedback()
  const setOptimisticState = useEntityStore((state) => state.setOptimisticState)
  const setSelectedEntity = useUIStore((state) => state.setSelectedEntity)
  const busyRef = useRef(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { current, target, min, max, step, unit, adjustable } = getClimateControls(entity)
  const humidity = numberAttr(entity?.attributes?.current_humidity)
  const modes = getClimateModes(entity)
  const fanModes = listAttr(entity?.attributes?.fan_modes)
  const fanMode = typeof entity?.attributes?.fan_mode === 'string' ? entity.attributes.fan_mode : undefined
  const swingMode = typeof entity?.attributes?.swing_mode === 'string' ? entity.attributes.swing_mode : undefined
  const presetMode = typeof entity?.attributes?.preset_mode === 'string' ? entity.attributes.preset_mode : undefined
  const visual = getClimateVisualState(entity)
  const modeTone = climateTone(visual.tone)
  const targetTone = temperatureTone(target ?? current, unit)
  const Icon = iconOverride ?? MODE_ICONS[modeIconKey(visual)] ?? Thermometer
  const unavailable = visual.unavailable
  const busy = pendingAction !== null
  const controlsDisabled = busy || unavailable || isEditing
  const onMode = pickOnHvacMode(modes, entity?.state)
  const quickModes = useMemo(() => {
    const currentMode = visual.mode !== 'off' ? visual.mode : undefined
    return [...new Set([currentMode, ...QUICK_MODE_ORDER])]
      .filter((mode): mode is string => typeof mode === 'string' && modes.includes(mode))
      .slice(0, 4)
  }, [modes, visual.mode])

  const perform = (
    key: string,
    optimistic: () => void,
    task: () => Promise<unknown>,
    rollback: () => void,
  ) => {
    if (busyRef.current || unavailable || isEditing) return
    busyRef.current = true
    setPendingAction(key)
    setError(null)
    void performEntityAction(entityId, optimistic, task, rollback)
      .catch(() => {
        actionFailed()
        setError('Comando non eseguito')
      })
      .finally(() => {
        busyRef.current = false
        setPendingAction(null)
      })
  }

  const setTemperature = (nextValue: number) => {
    if (!entity || !adjustable || target === undefined) return
    const next = snapClimateTemperature(nextValue, min, max, step)
    if (next === target) return
    perform(
      'temperature',
      () => { light(); setOptimisticState(entityId, entity.state, { temperature: next }) },
      () => call('climate', 'set_temperature', { entity_id: entityId, temperature: next }),
      () => setOptimisticState(entityId, entity.state, { temperature: target }),
    )
  }

  const setMode = (mode: string) => {
    if (!entity) return
    const previousAction = entity.attributes?.hvac_action
    perform(
      `mode:${mode}`,
      () => { medium(); setOptimisticState(entityId, mode, { hvac_action: mode === 'off' ? 'off' : undefined }) },
      () => call('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: mode }),
      () => setOptimisticState(entityId, entity.state, { hvac_action: previousAction }),
    )
  }

  const togglePower = () => setMode(visual.isOn ? 'off' : onMode)

  const cycleFan = () => {
    if (!entity || fanModes.length === 0) return
    const index = Math.max(0, fanModes.indexOf(fanMode ?? fanModes[0]))
    const next = fanModes[(index + 1) % fanModes.length]
    perform(
      'fan',
      () => { light(); setOptimisticState(entityId, entity.state, { fan_mode: next }) },
      () => call('climate', 'set_fan_mode', { entity_id: entityId, fan_mode: next }),
      () => setOptimisticState(entityId, entity.state, { fan_mode: fanMode }),
    )
  }

  const common = {
    label,
    size,
    Icon,
    visual,
    current,
    target,
    humidity,
    unit,
    adjustable,
    fanMode,
    swingMode,
    presetMode,
    accent: modeTone.color,
    targetAccent: targetTone.color,
    min,
    max,
    step,
    controlsDisabled,
    preview: isEditing,
    pendingAction,
    error,
    quickModes,
    onDetails: () => setSelectedEntity(entityId),
    onAdjust: (delta: number) => target !== undefined && setTemperature(target + delta * step),
    onPower: togglePower,
    onMode: setMode,
    onFan: cycleFan,
  }

  return (
    <WidgetCardShell
      id={cardId}
      type="climate"
      size={size}
      title={label}
      icon={Icon}
      status={climateStatus(visual.tone)}
      accentColor={modeTone.color}
      isActive={visual.isOn}
      isUnavailable={unavailable}
      isUnknown={entity?.state === 'unknown'}
      isPending={busy}
      isEditing={isEditing}
      isDragging={isDragging}
      onClick={() => setSelectedEntity(entityId)}
      className={cn('widget-card-climate', feedbackClass, className)}
    >
      {error && <span role="alert" className="sr-only">{error}</span>}
      {size === 'XS' ? <ClimateXS {...common} />
        : size === 'S' ? <ClimateS {...common} />
          : size === 'M' ? <ClimateM {...common} />
            : size === 'L' ? <ClimateL {...common} />
              : <ClimateXL {...common} />}
    </WidgetCardShell>
  )
}

interface ClimateLayoutProps {
  label: string
  size: WidgetVisualSize
  Icon: ElementType
  visual: ReturnType<typeof getClimateVisualState>
  unit: string
  adjustable: boolean
  current?: number
  target?: number
  humidity?: number
  fanMode?: string
  swingMode?: string
  presetMode?: string
  accent: string
  targetAccent: string
  min: number
  max: number
  step: number
  controlsDisabled: boolean
  preview: boolean
  pendingAction: string | null
  error: string | null
  quickModes: string[]
  onAdjust: (delta: number) => void
  onPower: () => void
  onMode: (mode: string) => void
  onDetails: () => void
  onFan: () => void
}

function ClimateXS(props: ClimateLayoutProps) {
  return <div className="flex h-full min-w-0 items-center gap-2">
    <WidgetCardIcon Icon={props.Icon} size="XS" accentColor={props.accent} active={props.visual.isOn} />
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-[var(--ink)]">{props.label}</p>
      <p className="mt-1 truncate text-[13px] text-[var(--ink-secondary)]">{props.error ?? climateHeadline(props.visual)}</p>
    </div>
    <p className="shrink-0 text-[20px] font-semibold tabular-nums text-[var(--ink)]">{formatClimateTemp(props.current, props.unit)}</p>
  </div>
}

function ClimateS(props: ClimateLayoutProps) {
  return <div className="flex h-full min-h-0 flex-col justify-between gap-2">
    <ClimateHeader {...props} compact />
    <div className="flex min-w-0 items-end justify-between gap-2">
      <TemperatureMetric unit={props.unit} label="Attuale" value={props.current} size="sm" />
      <TemperatureMetric unit={props.unit} label="Impostata" value={props.target} size="sm" />
    </div>
  </div>
}

function Setpoint(props: ClimateLayoutProps) {
  return <div className="climate-setpoint flex shrink-0 items-center gap-2">
    <TemperatureButton direction="down" {...props} />
    <div className="min-w-[68px] text-center">
      <p className="text-[13px] text-[var(--ink-secondary)]">Impostata</p>
      <p className="text-[22px] font-semibold leading-tight tabular-nums text-[var(--ink)]">{formatClimateTemp(props.target, props.unit)}</p>
    </div>
    <TemperatureButton direction="up" {...props} />
  </div>
}

function ClimateM(props: ClimateLayoutProps) {
  return <div className="climate-medium flex h-full min-h-0 flex-col justify-between gap-2">
    <ClimateHeader {...props} />
    <div className="climate-compact-values flex min-w-0 items-end justify-between gap-2">
      <TemperatureMetric unit={props.unit} label="Attuale" value={props.current} size="lg" />
      <Setpoint {...props} />
    </div>
  </div>
}

function ClimateL(props: ClimateLayoutProps) {
  return <div className="climate-large flex h-full min-h-0 flex-col gap-3">
    <ClimateHeader {...props} />
    <div className="climate-large-body grid min-h-0 flex-1 grid-cols-2 items-center gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <TemperatureMetric unit={props.unit} label="Attuale" value={props.current} size="xl" />
        <Setpoint {...props} />
      </div>
      <QuickModes {...props} />
    </div>
    <ClimateFooter {...props} />
  </div>
}

function ClimateXL(props: ClimateLayoutProps) {
  return <div className="climate-wide flex h-full min-w-0 items-center justify-between gap-4">
    <div className="min-w-0 flex-1"><ClimateHeader {...props} compact /><p className="mt-2 text-[13px] text-[var(--ink-secondary)]">Attuale {formatClimateTemp(props.current, props.unit)}</p></div>
    <Setpoint {...props} />
    {!props.preview && <button type="button" className="widget-card-control pointer-events-auto min-h-11 rounded-[14px] px-3 text-[13px] text-[var(--ink)]" onClick={(event) => { event.stopPropagation(); props.onDetails() }}>Altre modalità</button>}
  </div>
}

function ClimateHeader(props: ClimateLayoutProps & { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <WidgetCardIcon Icon={props.Icon} size={props.compact ? 'S' : props.size} accentColor={props.accent} active={props.visual.isOn} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn('truncate font-semibold leading-tight text-[var(--ink)] ', props.compact ? 'text-[14px]' : 'text-[15px]')}>{props.label}</p>
        <p className="mt-0.5 truncate text-[13px] font-normal" style={{ color: props.error ? '#dc2626' : props.accent }}>
          {props.error ?? climateHeadline(props.visual)}
        </p>
      </div>
      <ClimatePowerButton {...props} />
    </div>
  )
}

function ClimatePowerButton(props: ClimateLayoutProps & { compact?: boolean }) {
  const stop = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    props.onPower()
  }
  const className = cn(
    'relative flex shrink-0 items-center justify-center rounded-full transition',
    !props.preview && 'tap-target pointer-events-auto active:scale-90 disabled:opacity-35',
    'h-11 min-w-11 gap-1 px-2',
  )
  const style = {
    color: props.visual.isOn ? props.accent : 'var(--ink-secondary)',
    background: props.visual.isOn ? `color-mix(in srgb, ${props.accent} 16%, transparent)` : 'var(--fill-subtle)',
  }
  const content = <>
      <Power size={props.compact ? 14 : 15} aria-hidden="true" />
      {!props.compact && <span className="text-[13px] font-semibold">{props.pendingAction?.startsWith('mode:') ? '…' : props.visual.onOffLabel}</span>}
    </>
  if (props.preview) return <span className={className} style={style} aria-hidden="true">{content}</span>
  return (
    <button
      type="button"
      onClick={stop}
      disabled={props.controlsDisabled}
      aria-label={props.visual.isOn ? `Spegni ${props.label}` : `Accendi ${props.label}`}
      aria-pressed={props.visual.isOn}
      className={className}
      style={style}
    >{content}</button>
  )
}

function TemperatureButton(props: ClimateLayoutProps & { direction: 'up' | 'down' }) {
  const icon = props.direction === 'up' ? <Plus size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />
  if (props.preview) return <span className="widget-card-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--ink-tertiary)]" aria-hidden="true">{icon}</span>
  return (
    <WidgetCardControlButton
      disabled={props.controlsDisabled || !props.adjustable || props.target === undefined || (props.direction === 'up' ? props.target >= props.max : props.target <= props.min)}
      onClick={() => props.onAdjust(props.direction === 'up' ? 1 : -1)}
      label={props.direction === 'up' ? 'Aumenta temperatura' : 'Diminuisci temperatura'}
    >
      {icon}
    </WidgetCardControlButton>
  )
}

function TemperatureMetric({ label, value, size, unit }: { unit: string; label: string; value?: number; size: 'sm' | 'lg' | 'xl' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-semibold text-[var(--ink-secondary)]">{label}</p>
      <p className={cn(
        'mt-1 font-semibold leading-none tracking-tight tabular-nums text-[var(--ink)] ',
        size === 'sm' ? 'text-[20px]' : size === 'lg' ? 'text-[30px]' : 'text-[38px]',
      )}>{formatClimateTemp(value, unit)}</p>
    </div>
  )
}

function QuickModes(props: ClimateLayoutProps & { compact?: boolean; wide?: boolean }) {
  if (props.quickModes.length === 0) return null
  return (
    <div className="min-w-0">
      {!props.compact && !props.wide && <p className="mb-1.5 text-[13px] font-semibold text-[var(--ink-secondary)]">Modalità</p>}
      <div className={cn('grid gap-2', props.compact ? 'grid-cols-4' : props.wide || props.quickModes.length >= 4 ? 'grid-cols-2' : 'grid-cols-1')}>
        {props.quickModes.map((mode) => {
          const active = props.visual.mode === mode
          const Icon = MODE_ICONS[mode] ?? Thermometer
          const className = cn(
            'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[11px] px-2 text-[13px] font-semibold transition',
            !props.preview && 'pointer-events-auto active:scale-95 disabled:opacity-35',
            active ? 'bg-[var(--action-fill)] text-[var(--on-accent)] shadow-sm' : 'bg-[var(--fill-subtle)] text-[var(--ink-secondary)]',
          )
          const content = <>
              <Icon size={13} className="shrink-0" aria-hidden="true" />
              {!props.compact && <span className="truncate">{getHvacModeLabel(mode)}</span>}
            </>
          if (props.preview) return <span key={mode} className={className} >{content}</span>
          return (
            <button
              key={mode}
              type="button"
              onClick={(event) => { event.stopPropagation(); props.onMode(mode) }}
              disabled={props.controlsDisabled}
              aria-pressed={active}
              aria-label={`Modalità ${getHvacModeLabel(mode)}`}
              className={className}

            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ClimateFooter(props: ClimateLayoutProps & { compact?: boolean }) {
  const items: { Icon: ElementType; label: string; action?: () => void }[] = []
  if (props.fanMode) items.push({ Icon: Fan, label: `Ventola ${getClimateOptionLabel(props.fanMode)}`, action: props.onFan })
  if (props.swingMode) items.push({ Icon: Wind, label: `Oscillazione ${getClimateOptionLabel(props.swingMode)}` })
  if (props.presetMode) items.push({ Icon: Sparkles, label: getClimateOptionLabel(props.presetMode) })
  if (items.length === 0) return null
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {items.map(({ Icon, label, action }) => action && !props.preview ? (
        <button
          key={label}
          type="button"
          onClick={(event) => { event.stopPropagation(); action() }}
          disabled={props.controlsDisabled}
          className="pointer-events-auto flex min-h-11 min-w-0 items-center gap-1 rounded-full bg-[var(--fill-subtle)] px-2 text-[13px] font-semibold text-[var(--ink-secondary)] transition active:scale-95 disabled:opacity-35 dark:bg-white/[0.07]"
          aria-label={`${label}; tocca per cambiare`}
        >
          <Icon size={11} className="shrink-0" /><span className="truncate">{props.compact ? label.replace('Ventola ', '') : label}</span>
        </button>
      ) : (
        <span key={label} className="flex min-h-11 min-w-0 items-center gap-1 rounded-full bg-[var(--fill-subtle)] px-2 text-[13px] font-semibold text-[var(--ink-secondary)] dark:bg-white/[0.07]">
          <Icon size={11} className="shrink-0" /><span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  )
}

function climateHeadline(visual: ReturnType<typeof getClimateVisualState>): string {
  return visual.actionLabel
}
